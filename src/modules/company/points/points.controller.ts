// Phase 8 (P2) — Points Rules Engine controller.
//
// Mirrors the merged-params shape used by `evaluations` and
// `attendance`: this router is mounted under
// `/company/:companyId/points` (see routes.ts) and inherits
// `:companyId` via `mergeParams: true`.
//
// Role guard: COMPANY_OWNER only. `assertOwnedCompany` inside
// the service checks the actor actually owns the company in the
// path.
//
// Every route has a full `@swagger` block; shared response
// shapes live in `components.schemas` at the bottom of the file
// (scoped to this file via swagger-jsdoc's `@swagger
// components:` directive).

import { Router } from "express"
import { PointsService } from "./points.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import * as PointsValidation from "./points.validation"

const pointsService = new PointsService()

const pointsRouter = Router({ mergeParams: true })

// auth + role guard apply to every route.
pointsRouter.use(auth(), AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]))

/**
 * @swagger
 * /company/{companyId}/points/rules:
 *   get:
 *     summary: List points rules for a company
 *     description: |
 *       Returns every rule for the company in the path, newest
 *       first. Optional filters: `category`, `status`.
 *       Pagination: `page` (1-based, default 1) + `limit`
 *       (default 50, max 100).
 *
 *       Cached for 60 s; busted by any rule mutation.
 *     tags: [Dashboard - Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         required: false
 *         schema:
 *           type: string
 *           enum: [attendance, tasks, performance, community]
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *     responses:
 *       200:
 *         description: Rules fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     rules:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/PointsRule' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *                 msg: { type: string }
 *       400:
 *         description: Invalid company id
 *       401:
 *         description: Missing or invalid bearer token
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Company not found
 */
pointsRouter.get(
    '/rules',
    validation(PointsValidation.listRulesQuerySchema, 'query'),
    pointsService.listRules,
)

/**
 * @swagger
 * /company/{companyId}/points/rules:
 *   post:
 *     summary: Create a points rule
 *     description: |
 *       New rules default to `status: active`. Pass an explicit
 *       `status` later via PATCH if you want to seed an inactive
 *       rule.
 *     tags: [Dashboard - Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePointsRule' }
 *     responses:
 *       201:
 *         description: Rule created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     rule: { $ref: '#/components/schemas/PointsRule' }
 *                 msg: { type: string }
 *       400:
 *         description: Validation error / invalid company id
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Company not found
 */
pointsRouter.post(
    '/rules',
    validation(PointsValidation.createRuleSchema),
    pointsService.createRule,
)

/**
 * @swagger
 * /company/{companyId}/points/rules/{ruleId}:
 *   patch:
 *     summary: Update an existing points rule
 *     description: |
 *       Every field optional. An empty body is rejected with a
 *       400 ("At least one field is required") so we don't
 *       silently no-op.
 *     tags: [Dashboard - Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdatePointsRule' }
 *     responses:
 *       200:
 *         description: Rule updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     rule: { $ref: '#/components/schemas/PointsRule' }
 *       400:
 *         description: Invalid id / empty body
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Rule or company not found
 */
pointsRouter.patch(
    '/rules/:ruleId',
    validation(PointsValidation.ruleIdParamSchema, 'params'),
    validation(PointsValidation.updateRuleSchema),
    pointsService.updateRule,
)

/**
 * @swagger
 * /company/{companyId}/points/rules/{ruleId}:
 *   delete:
 *     summary: Delete a points rule
 *     description: |
 *       Hard delete. Existing point transactions that referenced
 *       this rule keep their historical record (the rule id is
 *       captured at award time, not looked up on read).
 *     tags: [Dashboard - Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Rule deleted successfully
 *       400:
 *         description: Invalid id
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Rule or company not found
 */
pointsRouter.delete(
    '/rules/:ruleId',
    validation(PointsValidation.ruleIdParamSchema, 'params'),
    pointsService.deleteRule,
)

/**
 * @swagger
 * /company/{companyId}/points/stats:
 *   get:
 *     summary: Aggregated stats for the Points Configuration dashboard
 *     description: |
 *       Four counters derived directly from the rules and
 *       milestones collections:
 *
 *         - `activeRules`: count of rules with `status=active`.
 *         - `avgPointsPerMonth`: sum of `points * MONTHLY_FACTOR[frequency]`
 *           over every active rule, rounded to 1 decimal. The
 *           `MONTHLY_FACTOR` table is in
 *           `src/modules/company/points/points.service.ts`.
 *         - `totalRedemptions`: always 0 today. No redemption log
 *           yet — placeholder until milestone payouts wire up.
 *         - `systemHealth`: "operational" if the company has at
 *           least one active rule AND at least one milestone;
 *           otherwise "degraded".
 *
 *       Cached for 60 s under `points:stats:{companyId}`.
 *     tags: [Dashboard - Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Stats fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/PointsStats' }
 *                 msg: { type: string }
 *       400:
 *         description: Invalid company id
 *       401:
 *         description: Missing or invalid bearer token
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Company not found
 */
pointsRouter.get('/stats', pointsService.getStats)

/**
 * @swagger
 * /company/{companyId}/points/milestones:
 *   get:
 *     summary: List reward milestones for a company
 *     description: |
 *       Returns every milestone ordered by `threshold` ascending
 *       (so the intern dashboard can render them in the order
 *       interns will hit them). Pagination supported.
 *     tags: [Dashboard - Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *     responses:
 *       200:
 *         description: Milestones fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     milestones:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/PointsMilestone' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *                 msg: { type: string }
 *       400:
 *         description: Invalid company id
 */
pointsRouter.get(
    '/milestones',
    validation(PointsValidation.listMilestonesQuerySchema, 'query'),
    pointsService.listMilestones,
)

/**
 * @swagger
 * /company/{companyId}/points/milestones:
 *   post:
 *     summary: Create a reward milestone
 *     description: |
 *       `threshold` is the cumulative `enrollments[].totalPoints`
 *       value at which the milestone fires. `reward` is a short
 *       free-text label rendered on the intern dashboard.
 *     tags: [Dashboard - Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePointsMilestone' }
 *     responses:
 *       201:
 *         description: Milestone created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     milestone: { $ref: '#/components/schemas/PointsMilestone' }
 *                 msg: { type: string }
 *       400:
 *         description: Validation error / invalid company id
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Company not found
 */
pointsRouter.post(
    '/milestones',
    validation(PointsValidation.createMilestoneSchema),
    pointsService.createMilestone,
)

/**
 * @swagger
 * /company/{companyId}/points/milestones/{milestoneId}:
 *   patch:
 *     summary: Update a milestone
 *     tags: [Dashboard - Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdatePointsMilestone' }
 *     responses:
 *       200:
 *         description: Milestone updated successfully
 *       400:
 *         description: Invalid id / empty body
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Milestone or company not found
 */
pointsRouter.patch(
    '/milestones/:milestoneId',
    validation(PointsValidation.milestoneIdParamSchema, 'params'),
    validation(PointsValidation.updateMilestoneSchema),
    pointsService.updateMilestone,
)

/**
 * @swagger
 * /company/{companyId}/points/milestones/{milestoneId}:
 *   delete:
 *     summary: Delete a milestone
 *     tags: [Dashboard - Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Milestone deleted successfully
 *       400:
 *         description: Invalid id
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Milestone or company not found
 */
pointsRouter.delete(
    '/milestones/:milestoneId',
    validation(PointsValidation.milestoneIdParamSchema, 'params'),
    pointsService.deleteMilestone,
)

/**
 * @swagger
 * components:
 *   schemas:
 *     PointsRule:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         companyId: { type: string }
 *         title: { type: string }
 *         category:
 *           type: string
 *           enum: [attendance, tasks, performance, community]
 *         points:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *         frequency:
 *           type: string
 *           enum: [daily, weekly, per_task, one_time]
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *         description: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     CreatePointsRule:
 *       type: object
 *       required: [title, category, points, frequency]
 *       properties:
 *         title: { type: string, minLength: 2, maxLength: 120 }
 *         category:
 *           type: string
 *           enum: [attendance, tasks, performance, community]
 *         points: { type: integer, minimum: 1, maximum: 10000 }
 *         frequency:
 *           type: string
 *           enum: [daily, weekly, per_task, one_time]
 *         description: { type: string, maxLength: 1000 }
 *
 *     UpdatePointsRule:
 *       type: object
 *       description: Every field optional. Empty body is rejected with 400.
 *       properties:
 *         title: { type: string, minLength: 2, maxLength: 120 }
 *         category:
 *           type: string
 *           enum: [attendance, tasks, performance, community]
 *         points: { type: integer, minimum: 1, maximum: 10000 }
 *         frequency:
 *           type: string
 *           enum: [daily, weekly, per_task, one_time]
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *         description: { type: string, maxLength: 1000 }
 *
 *     PointsMilestone:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         companyId: { type: string }
 *         title: { type: string }
 *         threshold: { type: integer, minimum: 1, maximum: 1000000 }
 *         reward: { type: string }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     CreatePointsMilestone:
 *       type: object
 *       required: [title, threshold, reward]
 *       properties:
 *         title: { type: string, minLength: 2, maxLength: 120 }
 *         threshold: { type: integer, minimum: 1, maximum: 1000000 }
 *         reward: { type: string, minLength: 1, maxLength: 200 }
 *
 *     UpdatePointsMilestone:
 *       type: object
 *       description: Every field optional. Empty body is rejected with 400.
 *       properties:
 *         title: { type: string, minLength: 2, maxLength: 120 }
 *         threshold: { type: integer, minimum: 1, maximum: 1000000 }
 *         reward: { type: string, minLength: 1, maxLength: 200 }
 *
 *     PointsStats:
 *       type: object
 *       properties:
 *         activeRules: { type: integer, description: 'Count of rules with status=active.' }
 *         avgPointsPerMonth: { type: number, description: 'Projected total monthly point pool, rounded to 1 decimal.' }
 *         totalRedemptions: { type: integer, description: 'Always 0 today. Placeholder for future milestone redemption log.' }
 *         systemHealth:
 *           type: string
 *           enum: [operational, degraded]
 *           description: 'operational when ≥1 active rule AND ≥1 milestone; otherwise degraded.'
 */

export { pointsRouter }
