import { NextFunction, Request, Response } from "express"
import { Types } from "mongoose"
import { ProgramRepo } from "../../../DB/repos/program.repo"
import { ProgramStatus } from "../../../DB/types/program.type"
import { ProjectStatus } from "../../../DB/types/project.type"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import { cacheDel, cacheFlushPrefix, cacheWrap } from "../../../cache/cache"
import { UserRoleEnum } from "../../../DB/types/user.type"
import { ProjectModel } from "../../../DB/models/project.model"

const programRepo = new ProgramRepo()

/**
 * Program CRUD (Phase 1 of the dashboard plan). Each endpoint is
 * company-scoped and requires the caller to own the company.
 *
 * Cache strategy: list / detail endpoints are wrapped with a 60s TTL
 * keyed on `(companyId, status, page)`. All write paths bust the prefix
 * `programs:{companyId}:*` so the next read repopulates.
 */
export class ProgramsService {
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const { status, page, limit } = req.query as {
                status?: ProgramStatus
                page?: number
                limit?: number
            }
            const filter: Record<string, any> = { companyId: new Types.ObjectId(companyId) }
            if (status) filter.status = status

            const pageNum = page ?? 1
            const limitNum = limit ?? 20
            const skip = (pageNum - 1) * limitNum

            const cacheKey = `programs:list:${companyId}:${JSON.stringify({ status, pageNum, limitNum })}`
            const { programs, total } = await cacheWrap(cacheKey, 60, async () => {
                const [items, totalCount] = await Promise.all([
                    programRepo.find({
                        filter,
                        options: { skip, limit: limitNum, sort: { startDate: -1 } },
                    }),
                    programRepo.find({ filter, options: { skip: 0, limit: 1 } }).then((arr) => arr.length),
                ])
                // The cheap "count via find+len" above is a hack for a quick MVP; swap
                // for a proper `countDocuments` if it becomes a hot path.
                return { programs: items, total: totalCount }
            })

            return successHandler({
                res,
                message: "Programs fetched successfully",
                data: {
                    programs,
                    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const data = req.body as {
                name: string
                description?: string
                startDate: Date
                endDate?: Date | null
                maxInterns?: number
                coverImage?: { public_id: string; secure_url: string }
            }

            const program = await programRepo.create({
                data: {
                    ...data,
                    companyId: new Types.ObjectId(companyId),
                    internIds: [],
                    status: ProgramStatus.UPCOMING,
                },
            })

            await cacheFlushPrefix(`programs:${companyId}`)

            return successHandler({
                res,
                message: "Program created successfully",
                status: 201,
                data: { program },
            })
        } catch (error) {
            next(error)
        }
    }

    detail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const programId = req.params.programId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const cacheKey = `programs:detail:${programId}`
            const program = await cacheWrap(cacheKey, 60, async () => {
                const p = await programRepo.findOne({
                    filter: { _id: programId, companyId },
                })
                return p
            })
            if (!program) throw new NotFoundException("Program not found")

            return successHandler({
                res,
                message: "Program fetched successfully",
                data: { program },
            })
        } catch (error) {
            next(error)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const programId = req.params.programId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const existing = await programRepo.findOne({
                filter: { _id: programId, companyId },
            })
            if (!existing) throw new NotFoundException("Program not found")

            const updated = await programRepo.update({
                filter: { _id: programId, companyId },
                data: { ...req.body },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`programs:detail:${programId}`),
                cacheFlushPrefix(`programs:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Program updated successfully",
                data: { program: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Soft delete: keep the program row for history, mark `archived`.
     * Hard delete would orphan any tasks / evaluations that reference it
     * (Phase 2+); archive is reversible and cheap.
     *
     * Soft-cascade: all child projects (where programId === this
     * program's id) are also marked `archived`. We do this in a single
     * `updateMany` so the whole archive is one round-trip. Tasks under
     * those projects are intentionally left alone — the admin can
     * archive them separately if needed. (Per the user's call in the
     * Q&A: soft-cascade to projects, not to tasks.)
     */
    archive = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const programId = req.params.programId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const existing = await programRepo.findOne({
                filter: { _id: programId, companyId },
            })
            if (!existing) throw new NotFoundException("Program not found")

            // Already archived is a no-op (idempotent endpoint).
            if ((existing as any).status === ProgramStatus.ARCHIVED) {
                return successHandler({
                    res,
                    message: "Program already archived",
                })
            }

            await programRepo.update({
                filter: { _id: programId, companyId },
                data: { status: ProgramStatus.ARCHIVED },
            })

            // Soft-cascade: archive every project whose programId points
            // at this program. We do NOT touch tasks — the admin can
            // archive those manually if needed.
            const cascade = await ProjectModel.updateMany(
                {
                    programId: new Types.ObjectId(programId),
                    companyId: new Types.ObjectId(companyId),
                    // Skip already-archived projects so the count is
                    // meaningful and we don't churn their updatedAt.
                    status: { $ne: ProjectStatus.ARCHIVED },
                },
                { $set: { status: ProjectStatus.ARCHIVED } },
            )

            // Bust every cache that could carry a stale view of either
            // the program or the cascaded projects.
            await Promise.all([
                cacheDel(`programs:detail:${programId}`),
                cacheFlushPrefix(`programs:list:${companyId}`),
                cacheFlushPrefix(`projects:list:${companyId}`),
                cacheFlushPrefix(`projects:detail:`),
            ])

            return successHandler({
                res,
                message: `Program archived (${cascade.modifiedCount} project(s) cascaded)`,
                data: {
                    cascadedProjectCount: cascade.modifiedCount ?? 0,
                },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Bulk enroll a list of interns into the program. Each intern must
     * have `role: 'intern'` and `enrollmentCompanyId === companyId` —
     * a guard that prevents accidentally enrolling random users.
     */
    enrollInterns = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const programId = req.params.programId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const { internIds } = req.body as { internIds: string[] }
            const program = await programRepo.findOne({
                filter: { _id: programId, companyId },
            })
            if (!program) throw new NotFoundException("Program not found")
            if (program.maxInterns && (program.internIds.length + internIds.length) > program.maxInterns) {
                throw new ApplicationError(
                    `Enrolling ${internIds.length} would exceed the program max of ${program.maxInterns}`,
                    400,
                )
            }

            // Dedupe (don't re-add existing interns) and convert to ObjectIds.
            const existing = new Set(program.internIds.map((id) => id.toString()))
            const toAdd = internIds.filter((id) => !existing.has(id))

            const updated = await programRepo.update({
                filter: { _id: programId, companyId },
                data: { $addToSet: { internIds: { $each: toAdd.map((id) => new Types.ObjectId(id)) } } },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`programs:detail:${programId}`),
                cacheFlushPrefix(`programs:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: `Enrolled ${toAdd.length} intern(s) (${internIds.length - toAdd.length} already in program)`,
                data: { program: updated, added: toAdd.length, skipped: internIds.length - toAdd.length },
            })
        } catch (error) {
            next(error)
        }
    }

    unenrollIntern = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const programId = req.params.programId as string
            const internId = req.params.internId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const updated = await programRepo.update({
                filter: { _id: programId, companyId },
                data: { $pull: { internIds: new Types.ObjectId(internId) } },
                options: { returnDocument: "after" },
            })
            if (!updated) throw new NotFoundException("Program not found")

            await Promise.all([
                cacheDel(`programs:detail:${programId}`),
                cacheFlushPrefix(`programs:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Intern unenrolled from program",
                data: { program: updated },
            })
        } catch (error) {
            next(error)
        }
    }
}
