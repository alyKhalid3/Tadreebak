// Phase 8 (P2) — Points Rules Engine validation.
//
// Wire shapes are tiny — only 4 fields for rules (title, category,
// points, frequency) plus optional status / description on update.
// Milestones are 3 fields. Heavy validation lives at the type
// layer (Mongoose enum + min/max); Zod is a thin shape check that
// also rejects empty PATCH bodies.
import { z } from "zod"
import {
    PointsCategoryEnum,
    PointsFrequencyEnum,
    PointsStatusEnum,
} from "../../../DB/types/pointsRule.type"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id")

const category = z.enum([
    PointsCategoryEnum.ATTENDANCE,
    PointsCategoryEnum.TASKS,
    PointsCategoryEnum.PERFORMANCE,
    PointsCategoryEnum.COMMUNITY,
])

const frequency = z.enum([
    PointsFrequencyEnum.DAILY,
    PointsFrequencyEnum.WEEKLY,
    PointsFrequencyEnum.PER_TASK,
    PointsFrequencyEnum.ONE_TIME,
])

const status = z.enum([
    PointsStatusEnum.ACTIVE,
    PointsStatusEnum.INACTIVE,
])

/**
 * Body for `POST /company/:id/points/rules`. Status is NOT in
 * the create shape — new rules default to `active` (mirrors
 * the Mongoose `default: PointsStatusEnum.ACTIVE`). Flip the
 * status explicitly via PATCH if you want to seed an inactive
 * rule.
 */
export const createRuleSchema = z.object({
    title: z.string().trim().min(2).max(120),
    category,
    points: z.coerce.number().int().min(1).max(10_000),
    frequency,
    description: z.string().trim().max(1000).optional(),
})

/**
 * Body for `PATCH /company/:id/points/rules/:ruleId`. Every
 * field optional; an empty object would silently no-op so we
 * reject it with a clean 400.
 */
export const updateRuleSchema = z
    .object({
        title: z.string().trim().min(2).max(120).optional(),
        category: category.optional(),
        points: z.coerce.number().int().min(1).max(10_000).optional(),
        frequency: frequency.optional(),
        status: status.optional(),
        description: z.string().trim().max(1000).optional(),
    })
    .refine((u) => Object.keys(u).length > 0, {
        message: "At least one field is required",
    })

export const listRulesQuerySchema = z.object({
    category: category.optional(),
    status: status.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const ruleIdParamSchema = z.object({
    ruleId: objectId,
})

/**
 * Body for `POST /company/:id/points/milestones`. `threshold`
 * is the cumulative `enrollments[].totalPoints` value at which
 * this milestone fires (e.g. 100 / 250 / 500). `reward` is a
 * short free-text label rendered on the intern dashboard.
 */
export const createMilestoneSchema = z.object({
    title: z.string().trim().min(2).max(120),
    threshold: z.coerce.number().int().min(1).max(1_000_000),
    reward: z.string().trim().min(1).max(200),
})

export const updateMilestoneSchema = z
    .object({
        title: z.string().trim().min(2).max(120).optional(),
        threshold: z.coerce.number().int().min(1).max(1_000_000).optional(),
        reward: z.string().trim().min(1).max(200).optional(),
    })
    .refine((u) => Object.keys(u).length > 0, {
        message: "At least one field is required",
    })

export const milestoneIdParamSchema = z.object({
    milestoneId: objectId,
})

export const listMilestonesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
})
