import { NextFunction, Request, Response } from "express"
import { Types } from "mongoose"
import { UserModel } from "../../../DB/models/user.model"
import { ProgramModel } from "../../../DB/models/program.model"
import { ProjectModel } from "../../../DB/models/project.model"
import { NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import { cacheWrap } from "../../../cache/cache"
import { EnrollmentStatus } from "../../../DB/types/user.type"

/**
 * Interns roster + detail (Phase 1 of the dashboard plan, updated
 * Phase 5 for multi-company).
 *
 * "Interns" are users who have an active / completed / withdrawn
 * enrollment at THIS company. The new model uses the `enrollments`
 * array — we filter by `{ 'enrollments.companyId': companyId }`.
 */
export class InternsService {
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const {
                programId,
                projectId,
                status = "all",
                search,
                sort = "recent",
                page = 1,
                limit = 20,
            } = req.query as {
                programId?: string
                projectId?: string
                status?: "active" | "alumni" | "all"
                search?: string
                sort?: "recent" | "name" | "points"
                page?: number
                limit?: number
            }

            const pageNum = page
            const limitNum = limit
            const skip = (pageNum - 1) * limitNum

            // Filter: any user with an enrollment at this company. We
            // also use $elemMatch to scope the status filter to this
            // specific enrollment (a user could have active at
            // company A and completed at company B).
            const filter: Record<string, any> = {
                "enrollments.companyId": new Types.ObjectId(companyId),
            }
            if (status === "active") {
                filter["enrollments.status"] = EnrollmentStatus.ACTIVE
            } else if (status === "alumni") {
                filter["enrollments.status"] = EnrollmentStatus.COMPLETED
            }
            if (search) {
                const re = new RegExp(escapeRegex(search), "i")
                filter.$or = [{ firstName: re }, { lastName: re }, { email: re }]
            }

            const cacheKey = `interns:list:${companyId}:${JSON.stringify({ programId, projectId, status, search, sort, pageNum, limitNum })}`
            const { interns, total } = await cacheWrap(cacheKey, 60, async () => {
                let internIdsFilter: Types.ObjectId[] | null = null
                if (programId) {
                    const program = await ProgramModel.findOne({ _id: programId, companyId }).lean()
                    if (!program) throw new NotFoundException("Program not found")
                    internIdsFilter = (program.internIds ?? []).map((id: any) => new Types.ObjectId(id))
                }
                if (projectId) {
                    const project = await ProjectModel.findOne({ _id: projectId, companyId }).lean()
                    if (!project) throw new NotFoundException("Project not found")
                    const projectInternIds = (project.internIds ?? []).map((id: any) => new Types.ObjectId(id))
                    if (internIdsFilter) {
                        internIdsFilter = internIdsFilter.filter((id) =>
                            projectInternIds.some((pid) => pid.equals(id)),
                        )
                    } else {
                        internIdsFilter = projectInternIds
                    }
                }
                if (internIdsFilter !== null) {
                    filter._id = { $in: internIdsFilter }
                }

                const sortSpec: Record<string, 1 | -1> =
                    sort === "name" ? { firstName: 1 } : sort === "points" ? { totalPoints: -1 } : { enrolledAt: -1 }

                // Project only what the roster UI needs.
                const projection = {
                    password: 0, emailOtp: 0, passwordOtp: 0, newEmailOtp: 0,
                    newEmail: 0, isChangeCredentialsUpdated: 0, __v: 0,
                } as const

                const [items, totalCount] = await Promise.all([
                    UserModel.find(filter, projection)
                        .sort(sortSpec)
                        .skip(skip)
                        .limit(limitNum)
                        .lean(),
                    UserModel.countDocuments(filter),
                ])
                return { interns: items, total: totalCount }
            })

            return successHandler({
                res,
                message: "Interns fetched successfully",
                data: {
                    interns,
                    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    detail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const internId = req.params.internId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            // The intern must have an enrollment at this company.
            // Same "scoped lookup" as the list endpoint.
            const intern = await UserModel.findOne(
                {
                    _id: internId,
                    "enrollments.companyId": new Types.ObjectId(companyId),
                },
                { password: 0, emailOtp: 0, passwordOtp: 0, newEmailOtp: 0, __v: 0 },
            ).lean()
            if (!intern) throw new NotFoundException("Intern not found")

            return successHandler({
                res,
                message: "Intern fetched successfully",
                data: { intern },
            })
        } catch (error) {
            next(error)
        }
    }
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
