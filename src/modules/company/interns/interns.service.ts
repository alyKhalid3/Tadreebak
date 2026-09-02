import { NextFunction, Request, Response } from "express"
import { Types } from "mongoose"
import { UserModel } from "../../../DB/models/user.model"
import { ProgramModel } from "../../../DB/models/program.model"
import { ProjectModel } from "../../../DB/models/project.model"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import { cacheWrap } from "../../../cache/cache"

/**
 * Interns roster + detail (Phase 1 of the dashboard plan).
 *
 * "Interns" in this context are users with `enrollmentCompanyId`
 * set — i.e. users that have at least one accepted application at
 * this company. The Phase 6 dashboard aggregations will join in
 * their evaluation + task data; for now the response is the
 * user profile fields the roster UI needs.
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

            // The company is the single source of truth for "who's my
            // intern?" — we filter by `enrollmentCompanyId`. Filtering
            // by `role: 'intern'` would also work but is redundant.
            const filter: Record<string, any> = {
                enrollmentCompanyId: new Types.ObjectId(companyId),
            }
            if (status === "active") filter.internshipEndDate = null
            if (status === "alumni") filter.internshipEndDate = { $ne: null }
            if (search) {
                // Case-insensitive name OR email search. Mongoose regex
                // with 'i' option — fine for the small N of interns per
                // company; if it becomes a hot path, switch to Atlas text
                // search or a denormalized `searchKey` field.
                const re = new RegExp(escapeRegex(search), "i")
                filter.$or = [{ firstName: re }, { lastName: re }, { email: re }]
            }

            // If filtering by program, restrict to that program's internIds.
            // If by project, similar. Both done as a post-filter on the
            // base set to keep the index simple.
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

                const [items, totalCount] = await Promise.all([
                    UserModel.find(filter, {
                        // Project only what the roster UI needs.
                        password: 0, emailOtp: 0, passwordOtp: 0, newEmailOtp: 0,
                        newEmail: 0, isChangeCredentialsUpdated: 0, __v: 0,
                    })
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

            // Company ownership of the intern is what we actually check —
            // a stranger can't fetch an intern from another company even
            // if they have a valid intern id.
            const intern = await UserModel.findOne(
                { _id: internId, enrollmentCompanyId: new Types.ObjectId(companyId) },
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

// Small helper to escape user input before passing to RegExp —
// prevents ReDoS via crafted search queries.
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
