// Phase 8 (P2) — Points Rules Engine service.
//
// CRUD for `PointsRule` and `PointsMilestone` plus a stats
// endpoint that derives the dashboard counters directly from the
// rules collection (BACKEND_GAPS_EN §3: "the page's statistics
// are derived from this same data").
//
// All endpoints are scoped to a single company via the path
// param. `assertOwnedCompany` gates every write so a
// company_owner can only touch their own company's rules.

import { NextFunction, Request, Response } from "express"
import mongoose, { isObjectIdOrHexString } from "mongoose"
import { PointsRuleModel } from "../../../DB/models/pointsRule.model"
import {
    PointsFrequencyEnum,
    PointsStatusEnum,
} from "../../../DB/types/pointsRule.type"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { cacheDel, cacheFlushPrefix, cacheWrap } from "../../../cache/cache"

// Cache key conventions
// -------------------
// `points:rules:{companyId}`      — list endpoint (any query hash would be a stretch — the page shows everything)
// `points:milestones:{companyId}` — list endpoint
// `points:stats:{companyId}`      — computed stats
//
// All three are busted by the prefix `points:{companyId}` on every
// rule / milestone mutation so we don't have to think about which
// keys each call affects.

const COMPANY_KEY = (companyId: string) => `points:${companyId}`

// Approximate events per month per frequency. Used by the stats
// endpoint to project a rule's per-month point contribution.
// One-time rules pay out exactly once, so their monthly rate
// over a 30-day window is `points / 30`. per_task has no
// well-defined monthly rate (depends on intern throughput) — we
// treat it as the rule's points/30 as a conservative baseline.
const MONTHLY_FACTOR: Record<PointsFrequencyEnum, number> = {
    [PointsFrequencyEnum.DAILY]: 30,
    [PointsFrequencyEnum.WEEKLY]: 4,
    [PointsFrequencyEnum.PER_TASK]: 1 / 30,
    [PointsFrequencyEnum.ONE_TIME]: 1 / 30,
}

export class PointsService {
    // -----------------------------------------------------------------
    // Rules
    // -----------------------------------------------------------------
    listRules = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            if (!isObjectIdOrHexString(companyId)) {
                throw new ApplicationError('Invalid company id', 400)
            }
            const companyObjectId = mongoose.Types.ObjectId.createFromHexString(
                companyId as string,
            )
            const { category, status, page, limit } = req.query as {
                category?: string
                status?: string
                page?: number
                limit?: number
            }

            const cacheKey = `points:rules:${companyId}:${JSON.stringify({
                category,
                status,
                page,
                limit,
            })}`

            const data = await cacheWrap(cacheKey, 60, async () => {
                const filter: Record<string, any> = { companyId: companyObjectId }
                if (category) filter.category = category
                if (status) filter.status = status

                const skip = ((page ?? 1) - 1) * (limit ?? 50)
                const [rules, total] = await Promise.all([
                    PointsRuleModel.find(filter)
                        .sort({ createdAt: -1 })
                        .skip(skip)
                        .limit(limit ?? 50)
                        .lean(),
                    PointsRuleModel.countDocuments(filter),
                ])

                return { rules, pagination: { page: page ?? 1, limit: limit ?? 50, total } }
            })

            return successHandler({ res, message: 'ok', data })
        } catch (error) {
            next(error)
        }
    }

    createRule = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            const { title, category, points, frequency, description } =
                req.body as {
                    title: string
                    category: string
                    points: number
                    frequency: string
                    description?: string
                }

            const rule = await PointsRuleModel.create({
                companyId: mongoose.Types.ObjectId.createFromHexString(companyId as string),
                title,
                category,
                points,
                frequency,
                status: PointsStatusEnum.ACTIVE,
                ...(description ? { description } : {}),
            })

            await cacheFlushPrefix(COMPANY_KEY(companyId as string))

            return successHandler({ res, status: 201, message: 'ok', data: { rule } })
        } catch (error) {
            next(error)
        }
    }

    updateRule = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, ruleId } = req.params
            if (!isObjectIdOrHexString(companyId) || !isObjectIdOrHexString(ruleId)) {
                throw new ApplicationError('Invalid id', 400)
            }
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            // Find the rule first to enforce the company-scope filter.
            // Without this, a stolen ruleId from another company could
            // be patched here.
            const existing = await PointsRuleModel.findOne({
                _id: new mongoose.Types.ObjectId(ruleId as string),
                companyId: new mongoose.Types.ObjectId(companyId as string),
            })
            if (!existing) {
                throw new NotFoundException('Rule not found')
            }

            const updated = await PointsRuleModel.findOneAndUpdate(
                {
                    _id: existing._id,
                    companyId: existing.companyId,
                },
                { $set: req.body },
                { new: true, runValidators: true },
            )

            await cacheFlushPrefix(COMPANY_KEY(companyId as string))

            return successHandler({ res, message: 'ok', data: { rule: updated } })
        } catch (error) {
            next(error)
        }
    }

    deleteRule = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, ruleId } = req.params
            if (!isObjectIdOrHexString(companyId) || !isObjectIdOrHexString(ruleId)) {
                throw new ApplicationError('Invalid id', 400)
            }
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            const result = await PointsRuleModel.deleteOne({
                _id: new mongoose.Types.ObjectId(ruleId as string),
                companyId: new mongoose.Types.ObjectId(companyId as string),
            })
            if (result.deletedCount === 0) {
                throw new NotFoundException('Rule not found')
            }

            await cacheFlushPrefix(COMPANY_KEY(companyId as string))

            return successHandler({ res, message: 'Rule deleted successfully' })
        } catch (error) {
            next(error)
        }
    }

    // -----------------------------------------------------------------
    // Stats (derived from the rules collection)
    // -----------------------------------------------------------------
    //
    // Interpretation of the four fields the page asks for:
    //
    //   activeRules          — count of rules with status=active.
    //                          The simplest possible number.
    //
    //   avgPointsPerMonth    — projected total monthly point pool.
    //                          Sums `points * MONTHLY_FACTOR[frequency]`
    //                          over every active rule. Not a per-intern
    //                          average — it's the company's monthly
    //                          payout budget if every eligible event
    //                          fires. The "avg" name follows the spec
    //                          wire format.
    //
    //   totalRedemptions     — always 0 today. No redemption entity
    //                          exists yet; the engine would record
    //                          milestone payouts once we wire milestone
    //                          → notification flow.
    //
    //   systemHealth         — "operational" if at least one active
    //                          rule exists AND the company has at
    //                          least one milestone defined, else
    //                          "degraded". Hides the "0 rules"
    //                          empty state from the dashboard so the
    //                          admin knows they need to seed data.
    //
    getStats = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            if (!isObjectIdOrHexString(companyId)) {
                throw new ApplicationError('Invalid company id', 400)
            }
            const companyObjectId = mongoose.Types.ObjectId.createFromHexString(
                companyId as string,
            )

            const data = await cacheWrap(
                `points:stats:${companyId}`,
                60,
                async () => {
                    const [activeRules, milestoneCount] = await Promise.all([
                        PointsRuleModel.find({
                            companyId: companyObjectId,
                            status: PointsStatusEnum.ACTIVE,
                        }).select('points frequency').lean(),
                        // The PointsMilestoneModel is registered in the same
                        // file as PointsRuleModel but exported separately.
                        // We import locally to avoid the circular concern —
                        // both models live in the same module on the DB side.
                        import('../../../DB/models/pointsRule.model').then(
                            ({ PointsMilestoneModel }) =>
                                PointsMilestoneModel.countDocuments({
                                    companyId: companyObjectId,
                                }),
                        ),
                    ])

                    const activeCount = activeRules.length
                    const monthlyPool = activeRules.reduce((sum, r) => {
                        const factor = MONTHLY_FACTOR[r.frequency as PointsFrequencyEnum] ?? 0
                        return sum + r.points * factor
                    }, 0)

                    return {
                        activeRules: activeCount,
                        // Round to 1 decimal — the page renders "450.5 / mo".
                        avgPointsPerMonth: Math.round(monthlyPool * 10) / 10,
                        // No redemption log today; placeholder for the future
                        // tally. Returning 0 is honest — the engine never
                        // recorded one.
                        totalRedemptions: 0,
                        // Operational iff at least one active rule AND at
                        // least one milestone. Without milestones the
                        // dashboard can't show the payout ladder.
                        systemHealth:
                            activeCount > 0 && milestoneCount > 0
                                ? 'operational'
                                : 'degraded',
                    }
                },
            )

            return successHandler({ res, message: 'ok', data })
        } catch (error) {
            next(error)
        }
    }

    // -----------------------------------------------------------------
    // Milestones
    // -----------------------------------------------------------------
    listMilestones = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            if (!isObjectIdOrHexString(companyId)) {
                throw new ApplicationError('Invalid company id', 400)
            }
            const companyObjectId = mongoose.Types.ObjectId.createFromHexString(
                companyId as string,
            )
            const { page, limit } = req.query as { page?: number; limit?: number }

            const cacheKey = `points:milestones:${companyId}:${JSON.stringify({ page, limit })}`

            const data = await cacheWrap(cacheKey, 60, async () => {
                const { PointsMilestoneModel } = await import(
                    '../../../DB/models/pointsRule.model'
                )
                const skip = ((page ?? 1) - 1) * (limit ?? 50)
                const [milestones, total] = await Promise.all([
                    PointsMilestoneModel.find({ companyId: companyObjectId })
                        .sort({ threshold: 1, createdAt: -1 })
                        .skip(skip)
                        .limit(limit ?? 50)
                        .lean(),
                    PointsMilestoneModel.countDocuments({ companyId: companyObjectId }),
                ])
                return {
                    milestones,
                    pagination: { page: page ?? 1, limit: limit ?? 50, total },
                }
            })

            return successHandler({ res, message: 'ok', data })
        } catch (error) {
            next(error)
        }
    }

    createMilestone = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            const { title, threshold, reward } = req.body as {
                title: string
                threshold: number
                reward: string
            }

            const { PointsMilestoneModel } = await import(
                '../../../DB/models/pointsRule.model'
            )
            const milestone = await PointsMilestoneModel.create({
                companyId: mongoose.Types.ObjectId.createFromHexString(companyId as string),
                title,
                threshold,
                reward,
            })

            await cacheFlushPrefix(COMPANY_KEY(companyId as string))

            return successHandler({
                res,
                status: 201,
                message: 'ok',
                data: { milestone },
            })
        } catch (error) {
            next(error)
        }
    }

    updateMilestone = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, milestoneId } = req.params
            if (
                !isObjectIdOrHexString(companyId) ||
                !isObjectIdOrHexString(milestoneId)
            ) {
                throw new ApplicationError('Invalid id', 400)
            }
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            const { PointsMilestoneModel } = await import(
                '../../../DB/models/pointsRule.model'
            )
            const existing = await PointsMilestoneModel.findOne({
                _id: new mongoose.Types.ObjectId(milestoneId as string),
                companyId: new mongoose.Types.ObjectId(companyId as string),
            })
            if (!existing) {
                throw new NotFoundException('Milestone not found')
            }

            const updated = await PointsMilestoneModel.findOneAndUpdate(
                { _id: existing._id, companyId: existing.companyId },
                { $set: req.body },
                { new: true, runValidators: true },
            )

            await cacheFlushPrefix(COMPANY_KEY(companyId as string))

            return successHandler({ res, message: 'ok', data: { milestone: updated } })
        } catch (error) {
            next(error)
        }
    }

    deleteMilestone = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, milestoneId } = req.params
            if (
                !isObjectIdOrHexString(companyId) ||
                !isObjectIdOrHexString(milestoneId)
            ) {
                throw new ApplicationError('Invalid id', 400)
            }
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            const { PointsMilestoneModel } = await import(
                '../../../DB/models/pointsRule.model'
            )
            const result = await PointsMilestoneModel.deleteOne({
                _id: new mongoose.Types.ObjectId(milestoneId as string),
                companyId: new mongoose.Types.ObjectId(companyId as string),
            })
            if (result.deletedCount === 0) {
                throw new NotFoundException('Milestone not found')
            }

            await cacheFlushPrefix(COMPANY_KEY(companyId as string))

            return successHandler({ res, message: 'Milestone deleted successfully' })
        } catch (error) {
            next(error)
        }
    }
}
