// Phase 4 — Evaluation CRUD (company-side).
//
// Endpoints:
//   - POST /company/:companyId/interns/:internId/evaluations  (create)
//   - GET  /company/:companyId/evaluations?internId=&period=    (list)
//   - GET  /company/:companyId/evaluations/:evaluationId       (detail)
//   - PATCH /company/:companyId/evaluations/:evaluationId      (update, before share)
//   - PATCH /company/:companyId/evaluations/:evaluationId/share (flip shared, notify)
//   - GET  /company/:companyId/evaluations/dashboard           (KPIs + chart)
//   - GET  /company/:companyId/evaluations/alerts              (low attendance / overdue)
//
// The service computes the derived fields (attendanceRate,
// overallScore) — admins never type them. The intern-side endpoint
// (in `src/modules/intern/evaluations/`) only returns evals with
// `sharedWithIntern: true`, minus `privateNotes`.

import { NextFunction, Request, Response } from "express"
import { Types, isObjectIdOrHexString } from "mongoose"
import { EvaluationRepo } from "../../../DB/repos/evaluation.repo"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { assertStaffPermission } from "../../../utils/companyAccess"
import {
    cacheDel,
    cacheFlushPrefix,
    cacheWrap,
} from "../../../cache/cache"
import { UserModel } from "../../../DB/models/user.model"
import { notificationEmitter } from "../../../utils/notifications/notificationEvents"
import { NotificationType } from "../../../DB/types/notification.type"
import {
    computeAttendanceRate,
    computeOverallScore,
    monthlyAttendanceChart,
    companyKpis,
    companyAlerts,
} from "../../../utils/aggregations/evaluation"
import { hasActiveEnrollmentAt } from "../../../utils/enrollment"

const evaluationRepo = new EvaluationRepo()

// Round 0-5 ratings to the nearest 0.5. We accept any number from
// the client but normalize on write so the stored value is always
// in {0, 0.5, 1, ..., 5}.
const halfStep = (n: number): number => Math.round(n * 2) / 2

export class EvaluationsService {
    // ---- Create evaluation ----
    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const internId = req.params.internId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'evaluations.create')

            if (!isObjectIdOrHexString(internId)) {
                throw new ApplicationError("Invalid intern id", 400)
            }

            // The intern must have an active enrollment at this
            // company — otherwise a company owner could write reviews
            // for a user at another company (privacy leak).
            const intern = await UserModel.findOne(
                { _id: new Types.ObjectId(internId) },
                {
                    firstName: 1,
                    lastName: 1,
                    enrollments: 1,
                },
            ).lean()
            if (!intern) throw new NotFoundException("Intern not found")
            if (!hasActiveEnrollmentAt(intern, companyId)) {
                throw new ApplicationError(
                    "This user is not an active intern at this company",
                    400,
                )
            }

            const data = req.body as {
                period: { start: Date; end: Date }
                skillRating: number
                teamworkRating: number
                strengths?: string
                improvements?: string
                privateNotes?: string
            }

            // Compute derived fields — the admin never types these.
            const attendanceRate = await computeAttendanceRate(
                internId,
                new Date(data.period.start),
                new Date(data.period.end),
            )
            const overallScore = computeOverallScore(
                attendanceRate,
                halfStep(data.skillRating),
                halfStep(data.teamworkRating),
            )

            const evaluation = await evaluationRepo.create({
                data: {
                    internId: new Types.ObjectId(internId),
                    companyId: new Types.ObjectId(companyId),
                    evaluatorId: new Types.ObjectId(user._id.toString()),
                    period: {
                        start: new Date(data.period.start),
                        end: new Date(data.period.end),
                    },
                    attendanceRate,
                    skillRating: halfStep(data.skillRating),
                    teamworkRating: halfStep(data.teamworkRating),
                    overallScore,
                    evaluatedAt: new Date(),
                    sharedWithIntern: false,
                    ...(data.strengths && { strengths: data.strengths }),
                    ...(data.improvements && { improvements: data.improvements }),
                    ...(data.privateNotes && { privateNotes: data.privateNotes }),
                },
            })

            await cacheFlushPrefix(`evaluations:${companyId}`)
            // Phase 5: bust both the per-company and legacy global keys
            // (the intern may still be hitting the old single-key cache
            // during the rollout window).
            await cacheDel(`intern:me:${internId}:${companyId}`)
            await cacheDel(`intern:me:${internId}`)

            notificationEmitter.publish(NotificationType.EVALUATION_CREATED, {
                recipient: internId,
                data: {
                    evaluationId: (evaluation as any)._id.toString(),
                    internName: `${intern.firstName} ${intern.lastName}`,
                    periodEnd: data.period.end,
                    companyId,
                },
            })

            return successHandler({
                res,
                message: "Evaluation created successfully",
                status: 201,
                data: { evaluation },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- List evaluations ----
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'evaluations.create')

            const { internId, period, page, limit } = req.query as {
                internId?: string
                period?: string
                page?: number
                limit?: number
            }

            const filter: Record<string, any> = {
                companyId: new Types.ObjectId(companyId),
            }
            if (internId) filter.internId = new Types.ObjectId(internId)
            if (period) {
                // "YYYY-MM" or "YYYY" — match the start date prefix.
                filter["period.start"] = { $regex: `^${period}` }
            }

            const pageNum = page ?? 1
            const limitNum = limit ?? 20
            const skip = (pageNum - 1) * limitNum

            const cacheKey = `evaluations:list:${companyId}:${JSON.stringify({ internId, period, pageNum, limitNum })}`
            const { items, total } = await cacheWrap(cacheKey, 60, async () => {
                const [rows, totalCount] = await Promise.all([
                    evaluationRepo.find({
                        filter,
                        options: { skip, limit: limitNum, sort: { evaluatedAt: -1 } },
                    }),
                    (await import("../../../DB/models/evaluation.model")).EvaluationModel.countDocuments(filter),
                ])
                return { items: rows, total: totalCount }
            })

            return successHandler({
                res,
                message: "Evaluations fetched successfully",
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

    // ---- Single eval detail ----
    detail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const evaluationId = req.params.evaluationId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'evaluations.create')

            if (!isObjectIdOrHexString(evaluationId)) {
                throw new ApplicationError("Invalid evaluation id", 400)
            }
            const cacheKey = `evaluations:detail:${evaluationId}`
            const evaluation = await cacheWrap(cacheKey, 60, async () => {
                return evaluationRepo.findOne({ filter: { _id: evaluationId, companyId } })
            })
            if (!evaluation) throw new NotFoundException("Evaluation not found")

            return successHandler({
                res,
                message: "Evaluation fetched successfully",
                data: { evaluation },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Update (only allowed before share) ----
    update = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const evaluationId = req.params.evaluationId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'evaluations.create')

            if (!isObjectIdOrHexString(evaluationId)) {
                throw new ApplicationError("Invalid evaluation id", 400)
            }
            const existing: any = await evaluationRepo.findOne({
                filter: { _id: evaluationId, companyId },
            })
            if (!existing) throw new NotFoundException("Evaluation not found")
            if (existing.sharedWithIntern) {
                throw new ApplicationError(
                    "Cannot edit an evaluation after it has been shared with the intern",
                    400,
                )
            }

            const update = { ...req.body } as Record<string, any>
            // Re-derive overallScore if the ratings changed.
            let overallScore = existing.overallScore
            if (update.skillRating !== undefined || update.teamworkRating !== undefined) {
                const skillRating = update.skillRating !== undefined
                    ? halfStep(update.skillRating)
                    : existing.skillRating
                const teamworkRating = update.teamworkRating !== undefined
                    ? halfStep(update.teamworkRating)
                    : existing.teamworkRating
                overallScore = computeOverallScore(
                    existing.attendanceRate,
                    skillRating,
                    teamworkRating,
                )
                update.skillRating = skillRating
                update.teamworkRating = teamworkRating
            }
            update.overallScore = overallScore

            const updated = await evaluationRepo.update({
                filter: { _id: evaluationId, companyId },
                data: update,
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`evaluations:detail:${evaluationId}`),
                cacheFlushPrefix(`evaluations:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Evaluation updated successfully",
                data: { evaluation: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Share with the intern ----
    share = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const evaluationId = req.params.evaluationId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'evaluations.create')

            if (!isObjectIdOrHexString(evaluationId)) {
                throw new ApplicationError("Invalid evaluation id", 400)
            }
            const existing: any = await evaluationRepo.findOne({
                filter: { _id: evaluationId, companyId },
            })
            if (!existing) throw new NotFoundException("Evaluation not found")
            if (existing.sharedWithIntern) {
                return successHandler({
                    res,
                    message: "Evaluation was already shared",
                })
            }

            const now = new Date()
            const updated = await evaluationRepo.update({
                filter: { _id: evaluationId, companyId },
                data: { sharedWithIntern: true, sharedAt: now },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`evaluations:detail:${evaluationId}`),
                cacheFlushPrefix(`evaluations:list:${companyId}`),
            ])

            notificationEmitter.publish(NotificationType.EVALUATION_SHARED, {
                recipient: existing.internId.toString(),
                data: {
                    evaluationId: evaluationId as string,
                    periodEnd: existing.period?.end,
                    companyId,
                },
            })

            return successHandler({
                res,
                message: "Evaluation shared with the intern",
                data: { evaluation: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Dashboard KPIs + 6-month chart ----
    dashboard = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'evaluations.create')

            // 60s cache — the dashboard hits this on every page load.
            const cacheKey = `evaluations:dashboard:${companyId}`
            const data = await cacheWrap(cacheKey, 60, async () => {
                const [kpis, chart] = await Promise.all([
                    companyKpis(companyId),
                    monthlyAttendanceChart(companyId, 6),
                ])
                return { kpis, chart }
            })

            return successHandler({
                res,
                message: "Dashboard data fetched successfully",
                data,
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Alerts (low attendance + overdue evals) ----
    alerts = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'evaluations.create')

            // Cache only briefly (30s) — alerts are time-sensitive.
            const cacheKey = `evaluations:alerts:${companyId}`
            const data = await cacheWrap(cacheKey, 30, async () => {
                return companyAlerts(companyId)
            })

            return successHandler({
                res,
                message: "Alerts fetched successfully",
                data,
            })
        } catch (error) {
            next(error)
        }
    }
}
