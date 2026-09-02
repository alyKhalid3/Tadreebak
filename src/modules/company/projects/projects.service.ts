import { NextFunction, Request, Response } from "express"
import { Types } from "mongoose"
import { ProjectRepo } from "../../../DB/repos/project.repo"
import { ProjectStatus } from "../../../DB/types/project.type"
import { NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import { cacheDel, cacheFlushPrefix, cacheWrap } from "../../../cache/cache"

const projectRepo = new ProjectRepo()

/**
 * Project CRUD (Phase 1 of the dashboard plan). Pattern matches
 * ProgramsService: company-scoped, ownership-checked, cache-wrapped.
 */
export class ProjectsService {
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const { status, programId, page, limit } = req.query as {
                status?: ProjectStatus
                programId?: string
                page?: number
                limit?: number
            }
            const filter: Record<string, any> = { companyId: new Types.ObjectId(companyId) }
            if (status) filter.status = status
            if (programId) filter.programId = new Types.ObjectId(programId)

            const pageNum = page ?? 1
            const limitNum = limit ?? 20
            const skip = (pageNum - 1) * limitNum

            const cacheKey = `projects:list:${companyId}:${JSON.stringify({ status, programId, pageNum, limitNum })}`
            const { projects, total } = await cacheWrap(cacheKey, 60, async () => {
                const [items, totalCount] = await Promise.all([
                    projectRepo.find({
                        filter,
                        options: { skip, limit: limitNum, sort: { createdAt: -1 } },
                    }),
                    // Proper count (find() doesn't return a count)
                    (await import("../../../DB/models/project.model")).ProjectModel.countDocuments(filter),
                ])
                return { projects: items, total: totalCount }
            })

            return successHandler({
                res,
                message: "Projects fetched successfully",
                data: {
                    projects,
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
                programId?: string
                internIds?: string[]
                startDate?: Date
                endDate?: Date | null
                color?: string
            }

            // Build the insert object without setting `undefined` on
            // optional fields — exactOptionalPropertyTypes would reject
            // `description: undefined`. The conditional spread skips them.
            const project = await projectRepo.create({
                data: {
                    name: data.name,
                    ...(data.description !== undefined && { description: data.description }),
                    ...(data.programId && { programId: new Types.ObjectId(data.programId) }),
                    internIds: (data.internIds ?? []).map((id) => new Types.ObjectId(id)),
                    ...(data.startDate && { startDate: data.startDate }),
                    ...(data.endDate !== undefined && { endDate: data.endDate }),
                    ...(data.color && { color: data.color }),
                    companyId: new Types.ObjectId(companyId),
                    status: ProjectStatus.ACTIVE,
                },
            })

            await cacheFlushPrefix(`projects:${companyId}`)

            return successHandler({
                res,
                message: "Project created successfully",
                status: 201,
                data: { project },
            })
        } catch (error) {
            next(error)
        }
    }

    detail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const projectId = req.params.projectId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const cacheKey = `projects:detail:${projectId}`
            const project = await cacheWrap(cacheKey, 60, async () => {
                return projectRepo.findOne({ filter: { _id: projectId, companyId } })
            })
            if (!project) throw new NotFoundException("Project not found")

            return successHandler({
                res,
                message: "Project fetched successfully",
                data: { project },
            })
        } catch (error) {
            next(error)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const projectId = req.params.projectId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const existing = await projectRepo.findOne({ filter: { _id: projectId, companyId } })
            if (!existing) throw new NotFoundException("Project not found")

            const updated = await projectRepo.update({
                filter: { _id: projectId, companyId },
                data: { ...req.body },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`projects:detail:${projectId}`),
                cacheFlushPrefix(`projects:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Project updated successfully",
                data: { project: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Soft delete: status → 'archived'. Reversible. Keeps task/evaluation
     * references intact for the dashboard's historical view.
     */
    archive = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const projectId = req.params.projectId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const existing = await projectRepo.findOne({ filter: { _id: projectId, companyId } })
            if (!existing) throw new NotFoundException("Project not found")

            await projectRepo.update({
                filter: { _id: projectId, companyId },
                data: { status: ProjectStatus.ARCHIVED },
            })

            await Promise.all([
                cacheDel(`projects:detail:${projectId}`),
                cacheFlushPrefix(`projects:list:${companyId}`),
            ])

            return successHandler({ res, message: "Project archived successfully" })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Assign interns to a project. The interns should already be
     * enrolled at the company (have `enrollmentCompanyId` set); the
     * project just tracks which of them work on it.
     */
    assignInterns = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const projectId = req.params.projectId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const { internIds } = req.body as { internIds: string[] }
            const project = await projectRepo.findOne({ filter: { _id: projectId, companyId } })
            if (!project) throw new NotFoundException("Project not found")

            const updated = await projectRepo.update({
                filter: { _id: projectId, companyId },
                data: { $addToSet: { internIds: { $each: internIds.map((id) => new Types.ObjectId(id)) } } },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`projects:detail:${projectId}`),
                cacheFlushPrefix(`projects:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Interns assigned to project",
                data: { project: updated },
            })
        } catch (error) {
            next(error)
        }
    }
}
