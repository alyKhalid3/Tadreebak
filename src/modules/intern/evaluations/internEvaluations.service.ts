// Phase 5 — intern-side evaluations, scoped to a single company.
//
// The intern can list their own evaluations AT THIS COMPANY.
// The filter is enforced server-side:
//   - only `sharedWithIntern: true` rows are returned
//   - the response strips `privateNotes` (the admin-only field)
//   - the internId is hard-coded to res.locals.user._id (the intern
//     cannot pass it)
//   - the companyId comes from the path; we re-check
//     hasActiveEnrollmentAt to be sure the intern belongs here
//
// The intern cannot see Company Y's evaluations while viewing
// Company X — the query is scoped by both internId and companyId,
// and the cache key is per-company.

import { NextFunction, Request, Response } from "express"
import { Types } from "mongoose"
import { EvaluationRepo } from "../../../DB/repos/evaluation.repo"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { cacheWrap } from "../../../cache/cache"
import { hasActiveEnrollmentAt } from "../../../utils/enrollment"

const evaluationRepo = new EvaluationRepo()

// Omit `privateNotes` (and any future admin-only fields) before
// shipping the row to the intern.
const projectForIntern = (e: any) => {
    if (!e) return e
    const { privateNotes, ...safe } = e
    return safe
}

export class InternEvaluationsService {
    listMine = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const internId = user._id.toString()
            const companyId = req.params.companyId as string

            if (!hasActiveEnrollmentAt(user, companyId)) {
                throw new NotFoundException(
                    "You are not enrolled at this company",
                )
            }

            const { period, page = 1, limit = 20 } = req.query as {
                period?: string
                page?: number
                limit?: number
            }

            const filter: Record<string, any> = {
                internId: new Types.ObjectId(internId),
                // Phase 5: every per-company view scopes by companyId too.
                companyId: new Types.ObjectId(companyId),
                // CRITICAL: the intern-side filter is hard-coded to
                // sharedWithIntern: true. Admins flip this when they
                // release the review. Without this filter, the
                // intern would see every draft, including the
                // admin's private notes.
                sharedWithIntern: true,
            }
            if (period) {
                filter["period.start"] = { $regex: `^${period}` }
            }

            const pageNum = page ?? 1
            const limitNum = limit ?? 20
            const skip = (pageNum - 1) * limitNum

            // Per-company cache key.
            const cacheKey = `evaluations:intern:${internId}:${companyId}:${JSON.stringify({ period, pageNum, limitNum })}`
            const { items, total } = await cacheWrap(cacheKey, 60, async () => {
                const [rows, totalCount] = await Promise.all([
                    evaluationRepo.find({
                        filter,
                        options: { skip, limit: limitNum, sort: { sharedAt: -1 } },
                    }),
                    (await import("../../../DB/models/evaluation.model")).EvaluationModel.countDocuments(filter),
                ])
                return {
                    items: rows.map(projectForIntern),
                    total: totalCount,
                }
            })

            return successHandler({
                res,
                message: "My evaluations fetched successfully",
                data: {
                    evaluations: items,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        pages: Math.ceil(total / limitNum),
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }
}
