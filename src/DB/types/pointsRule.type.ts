import { Types } from "mongoose"

/**
 * Where a rule belongs in the company's gamification taxonomy.
 * `attendance` / `tasks` are earned automatically by the points
 * engine when the source event fires. `performance` is awarded
 * manually by the admin (e.g. after an evaluation). `community`
 * covers peer-nominated / shoutout bonuses.
 */
export enum PointsCategoryEnum {
    ATTENDANCE = 'attendance',
    TASKS = 'tasks',
    PERFORMANCE = 'performance',
    COMMUNITY = 'community',
}

/**
 * How often a rule can fire for a single intern.
 *  - `daily`    — once per day (e.g. +5 for attending today)
 *  - `weekly`   — once per week (e.g. +20 for hitting weekly attendance)
 *  - `per_task` — once per task completion (e.g. +15 per task marked done)
 *  - `one_time` — exactly one payout per intern (e.g. onboarding bonus)
 */
export enum PointsFrequencyEnum {
    DAILY = 'daily',
    WEEKLY = 'weekly',
    PER_TASK = 'per_task',
    ONE_TIME = 'one_time',
}

/**
 * Whether the rule is currently applied. Inactive rules stay in
 * the DB so the admin can re-activate them later without
 * re-creating the row, and so historical point awards remain
 * attributable to a rule that was once active.
 */
export enum PointsStatusEnum {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

export interface IPointsRule {
    companyId: Types.ObjectId
    title: string
    category: PointsCategoryEnum
    points: number
    frequency: PointsFrequencyEnum
    status: PointsStatusEnum
    description?: string
    createdAt?: Date
    updatedAt?: Date
}

/**
 * Reward tiers — a milestone fires when an intern's lifetime
 * `enrollments[].totalPoints` at this company hits `threshold`.
 * `reward` is a free-text label ("Coffee voucher", "Featured
 * badge", "LinkedIn recommendation") rendered on the intern
 * dashboard.
 */
export interface IPointsMilestone {
    companyId: Types.ObjectId
    title: string
    threshold: number
    reward: string
    createdAt?: Date
    updatedAt?: Date
}
