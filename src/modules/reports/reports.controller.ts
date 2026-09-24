// Phase 16 / P3 #8 — Content reports controller.
//
// Single endpoint, auth required. The reporter can be any
// signed-in user; the row records `reporterId` so the admin
// queue can show "X reported Y for Z reason at time T".
//
// We don't verify that the target actually exists today — a
// report on a deleted / soft-deleted target is still valid for
// the audit log. The admin reviewer can decide what to do
// with stale rows.

import { Router } from "express"
import { validation } from "../../middleware/validation.middleware"
import { auth } from "../../middleware/authentication.middleware"
import { successHandler } from "../../utils/successHandler"
import { ReportModel } from "../../DB/models/report.model"
import { ReportStatus, ReportTargetType } from "../../DB/types/report.type"
import { createReportSchema } from "./reports.validation"

const router = Router()

/**
 * @swagger
 * /reports:
 *   post:
 *     summary: File a report about a company, user, or internship
 *     description: |
 *       Authenticated. Records the report against the reporter's
 *       `reporterId` with default `status: 'open'`. We don't
 *       verify the target still exists — a report on a stale
 *       id is still useful for the audit log; the admin-side
 *       queue can filter those.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateReport' }
 *     responses:
 *       201:
 *         description: Report received
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     report: { $ref: '#/components/schemas/Report' }
 *                 msg: { type: string }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid bearer token
 */
router.post('/', auth(), validation(createReportSchema), async (req, res, next) => {
    try {
        const user = res.locals.user
        const { targetType, targetId, reason } = req.body as {
            targetType: keyof typeof ReportTargetType
            targetId: string
            reason: string
        }
        const report = await ReportModel.create({
            reporterId: user._id,
            targetType,
            targetId,
            reason,
            status: ReportStatus.OPEN,
        })
        return successHandler({
            res,
            status: 201,
            message: 'Report received',
            data: { report },
        })
    } catch (err) {
        next(err)
    }
})

export { router as reportsRouter }

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateReport:
 *       type: object
 *       required: [targetType, targetId, reason]
 *       properties:
 *         targetType:
 *           type: string
 *           enum: [company, user, internship]
 *         targetId:
 *           type: string
 *           description: 24-char ObjectId of the target.
 *         reason:
 *           type: string
 *           minLength: 5
 *           maxLength: 1000
 *           description: 'Free-text explanation shown to the admin queue.'
 *
 *     Report:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         reporterId: { type: string }
 *         targetType:
 *           type: string
 *           enum: [company, user, internship]
 *         targetId: { type: string }
 *         reason: { type: string }
 *         status:
 *           type: string
 *           enum: [open, reviewed, dismissed, action_taken]
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */
