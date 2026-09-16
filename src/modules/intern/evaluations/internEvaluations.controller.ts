// Phase 5 — intern-side evaluations controller.
//
// Mounted at /api/v1/intern/me/:companyId/evaluations. The intern
// can list their own evaluations AT THIS COMPANY. The :companyId
// scoping ensures the intern can never see Company Y's evaluations
// while viewing Company X.
//
// The service hard-codes `sharedWithIntern: true` (the intern
// never sees drafts) and strips `privateNotes` (the admin-only
// field). The internId is hard-coded to res.locals.user._id (the
// intern cannot pass it).

import { Router } from "express"
import { InternEvaluationsService } from "./internEvaluations.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { requireIntern } from "../../../middleware/authorization.middleware"
import { z } from "zod"
import * as EvaluationsValidation from "../../company/evaluations/evaluations.validation"

const internEvaluationsService = new InternEvaluationsService()

const companyIdParamSchema = z.object({
    companyId: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid company id"),
})

const internEvaluationsRouter = Router({ mergeParams: true })

internEvaluationsRouter.use(auth(), requireIntern())

/**
 * @swagger
 * /intern/me/{companyId}/evaluations:
 *   get:
 *     summary: My evaluations at this company (only sharedWithIntern)
 *     description: |
 *       Returns the authenticated intern's evaluations that have
 *       been shared with them AND belong to the company in the path.
 *       Drafts and the admin's private notes are not exposed. The
 *       intern cannot read another intern's reviews.
 *
 *       **Three-layer scope check** (defense in depth):
 *         1. `requireIntern()` — role gate (or any active enrollment)
 *         2. `hasActiveEnrollmentAt(user, companyId)` — intern must
 *            be active AT THIS company (404 otherwise)
 *         3. Query filter is hard-coded to
 *            `internId = res.locals.user._id` AND
 *            `companyId = path :companyId` AND
 *            `sharedWithIntern = true` — the intern literally
 *            cannot pass these as query params; they're enforced
 *            server-side.
 *
 *       **Filter:**
 *         - `period` — `YYYY` or `YYYY-MM`, regex-matched on
 *           `period.start` (so `period=2026` matches every
 *           evaluation starting in 2026).
 *
 *       **Projection:** the service strips `privateNotes` before
 *       returning rows. The intern sees everything else, including
 *       `attendanceRate`, `skillRating`, `teamworkRating`,
 *       `overallScore`, the strengths/improvements text, and the
 *       `sharedAt` timestamp.
 *
 *       **Sort:** most recently shared first (`sharedAt: -1`),
 *       so a freshly-released review shows up at the top.
 *
 *       **Pagination:** `page` (1-based, default 1) + `limit`
 *       (default 20, max 100).
 *
 *       **Caching:** 60s under
 *       `evaluations:intern:{internId}:{companyId}:{queryHash}`.
 *       **Not** flushed when the admin shares an evaluation — the
 *       intern sees the update after at most 60s (open follow-up).
 *     tags: [Intern - Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *         description: |
 *           24-char ObjectId of the company whose evaluations to
 *           list. Must match one of the intern's active enrollments.
 *       - in: query
 *         name: period
 *         required: false
 *         schema: { type: string, minLength: 4, maxLength: 7 }
 *         description: 'YYYY or YYYY-MM, regex-matched on period.start'
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: My evaluations fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ListMyEvaluationsResponse'
 *       400: { description: Validation error (bad companyId, bad period) }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern (no role and no active enrollment) }
 *       404: { description: Not actively enrolled at this company }
 *
 *   # NOTE: The intern can ONLY read shared evaluations. There is
 *   # no create / update / delete / unshare endpoint on this side
 *   # by design. The intern cannot create their own self-review
 *   # today (open follow-up: per-intern self-rating for the same
 *   # period so the admin can compare).
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ListMyEvaluationsResponse:
 *       type: object
 *       description: |
 *         Response shape of `GET /intern/me/:companyId/evaluations`.
 *         Items are `EvaluationShared` (the admin's `Evaluation`
 *         with `privateNotes` stripped). Pagination is the shared
 *         `Pagination` schema from the admin module.
 *       properties:
 *         evaluations:
 *           type: array
 *           items: { $ref: '#/components/schemas/EvaluationShared' }
 *         pagination: { $ref: '#/components/schemas/Pagination' }
 */

internEvaluationsRouter.get(
    "/",
    validation(companyIdParamSchema, "params"),
    validation(EvaluationsValidation.myEvaluationsQuerySchema, "query"),
    internEvaluationsService.listMine,
)

export { internEvaluationsRouter }
