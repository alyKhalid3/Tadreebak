// Phase 4 — Evaluations company-side controller. Mirrors the
// projects / tasks controller shape: merged-params, auth + role
// guard, validation middleware with explicit `source`.
//
// Every route has a full `@swagger` block so the OpenAPI doc
// (served at /api-docs) carries the body shape, query params,
// every response status code, and the business rules (e.g.
// "can't edit after share", "engagement is 0 today").
// Shared schemas live in the bottom `@swagger components:` block.

import { Router } from "express"
import { EvaluationsService } from "./evaluations.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import * as EvaluationsValidation from "./evaluations.validation"

const evaluationsService = new EvaluationsService()

const evaluationsRouter = Router({ mergeParams: true })

// auth + role guard for every route.
evaluationsRouter.use(auth(), AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]))

/**
 * @swagger
 * /company/{companyId}/evaluations:
 *   get:
 *     summary: List evaluations written by this company
 *     description: |
 *       Returns every evaluation whose `companyId` matches the path
 *       (so a company owner never sees another company's reviews,
 *       even by accident).
 *
 *       **Filters:**
 *         - `internId` — only evaluations for one intern
 *         - `period` — `YYYY` or `YYYY-MM`, matched against
 *           `period.start` with a regex prefix (so `period=2026`
 *           matches every evaluation starting in 2026)
 *
 *       **Caching:** 60s under
 *       `evaluations:list:{companyId}:{queryHash}`. Cache is busted
 *       when an evaluation is created / updated / shared at this
 *       company.
 *
 *       **Sort:** newest first by `evaluatedAt`.
 *
 *       **Pagination:** `page` (1-based, default 1) + `limit`
 *       (default 20, max 100).
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *         description: 24-char ObjectId of the company in the URL
 *       - in: query
 *         name: internId
 *         required: false
 *         schema: { type: string }
 *         description: Optional 24-char ObjectId — restrict to one intern
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
 *         description: Evaluations fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ListEvaluationsResponse'
 *       400: { description: Validation error (bad ObjectId, bad period) }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 */
evaluationsRouter.get(
    "/",
    validation(EvaluationsValidation.listEvaluationsQuerySchema, "query"),
    evaluationsService.list,
)

/**
 * @swagger
 * /company/{companyId}/evaluations/dashboard:
 *   get:
 *     summary: Dashboard KPIs + 6-month attendance chart
 *     description: |
 *       Aggregated view for the company's Evaluations dashboard tab.
 *
 *       **Two parallel aggregations** (one round-trip total):
 *         1. `companyKpis` — avg attendance (last 30 days), avg
 *            skill rating + avg overallScore across all evaluations
 *            ever, count of evaluations created this month.
 *         2. `monthlyAttendanceChart` — one entry per month for the
 *            last 6 months, oldest first, with `presentDays`,
 *            `totalDays`, `rate`.
 *
 *       **Caching:** 60s under `evaluations:dashboard:{companyId}`.
 *       Flushed implicitly on create/update/share via the
 *       `evaluations:{companyId}` prefix flush.
 *
 *       **Known caveat (will fix in Phase 8):** month boundaries
 *       are computed in UTC, so an Egyptian company's "September"
 *       will run Sep 1 00:00 UTC → Sep 30 23:59 UTC instead of
 *       Sep 1 00:00 Cairo → Sep 30 23:59 Cairo. Off by 2 hours at
 *       each edge.
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EvaluationDashboardResponse'
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 */
evaluationsRouter.get(
    "/dashboard",
    evaluationsService.dashboard,
)

/**
 * @swagger
 * /company/{companyId}/evaluations/alerts:
 *   get:
 *     summary: At-risk interns (low attendance + overdue reviews)
 *     description: |
 *       Two lists to surface the red dot on the dashboard:
 *
 *       - `lowAttendance[]` — interns whose 30-day attendance rate
 *         is below 70% AND who have at least 3 attendance rows in
 *         the window (so we don't flag someone with one row at
 *         100% or 0%).
 *       - `evaluationOverdue[]` — interns who have NOT been
 *         evaluated in the last 30 days (no row, or latest
 *         `evaluatedAt` is older than 30 days).
 *
 *       **Cap:** 50 interns per call (alerts endpoint, not the full
 *       roster — keep it snappy).
 *
 *       **Caching:** 30s — alerts are time-sensitive.
 *
 *       **Known bug (will fix in Phase 8):** this endpoint still
 *       uses the legacy `enrollmentCompanyId` field to find
 *       interns. After the Phase 5 migration runs, every user who
 *       migrated is missing the legacy field, so this endpoint
 *       returns an empty list. Will switch to `enrollments[].companyId`
 *       + status filter.
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Alert lists (empty arrays if no issues)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EvaluationAlerts'
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 */
evaluationsRouter.get(
    "/alerts",
    evaluationsService.alerts,
)

/**
 * @swagger
 * /company/{companyId}/interns/{internId}/evaluations:
 *   post:
 *     summary: Create an evaluation for an intern
 *     description: |
 *       Admin writes a formal review over a date period. The admin
 *       provides the period + 2 subjective ratings; the service
 *       computes everything else:
 *
 *         - `attendanceRate` — percent of attendance rows in
 *           `[period.start, period.end]` with status ∈
 *           `{attended, late}` (Phase 7 renamed `present` → `attended`,
 *           `absent` → `missed`; missed and excused both count as
 *           not-present). Rounded to 2 decimals.
 *         - `overallScore` — clamped 0..100, weighted
 *           `0.3*attendanceRate + 0.3*skillPct + 0.2*teamworkPct +
 *           0.2*engagementScore`. Today `engagementScore = 0` —
 *           no engagement tracking yet (open follow-up).
 *
 *       **Ratings:** `skillRating` and `teamworkRating` are 0..5.
 *       The service normalizes to the nearest 0.5 (so `4.3 → 4.5`,
 *       `4.7 → 4.5`). Stored values are always in
 *       `{0, 0.5, 1, 1.5, ..., 5}`.
 *
 *       **Scope check:** the intern MUST be actively enrolled at
 *       this company. Returns 400 "This user is not an active
 *       intern at this company" otherwise.
 *
 *       **Fields you type vs the service computes:**
 *         - you type:  `period`, `skillRating`, `teamworkRating`,
 *           `strengths?`, `improvements?`, `privateNotes?`
 *         - service:   `attendanceRate`, `overallScore`,
 *           `evaluatorId` (from the JWT), `sharedWithIntern: false`
 *
 *       **Notifications:** `EVALUATION_CREATED` is sent to the
 *       intern (so they see a new review in their feed even
 *       before it's shared — they can't read it yet).
 *
 *       **Caching:** invalidates `evaluations:{companyId}` (prefix)
 *       AND `intern:me:{internId}:{companyId}` (per-company view)
 *       + the legacy single-key `intern:me:{internId}` during the
 *       rollout window. Picker key `intern:enrollments:{internId}`
 *       is NOT flushed (low risk — eval create doesn't mutate
 *       enrollments).
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: internId
 *         required: true
 *         schema: { type: string }
 *         description: 24-char ObjectId of the intern being reviewed
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEvaluation'
 *     responses:
 *       201:
 *         description: Evaluation created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EvaluationEnvelope'
 *       400:
 *         description: |
 *           Validation error (bad internId, bad period, ratings out
 *           of range, period.end < period.start) OR the intern is
 *           not actively enrolled at this company.
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Intern not found }
 */
evaluationsRouter.post(
    "/interns/:internId/evaluations",
    validation(EvaluationsValidation.internIdParamSchema, "params"),
    validation(EvaluationsValidation.createEvaluationSchema),
    evaluationsService.create,
)

/**
 * @swagger
 * /company/{companyId}/evaluations/{evaluationId}:
 *   get:
 *     summary: Evaluation detail (admin view — includes privateNotes)
 *     description: |
 *       Returns the full evaluation document, including
 *       `privateNotes` (the admin-only field that's stripped on the
 *       intern side). Scoped to `companyId` so a company owner
 *       cannot read another company's reviews.
 *
 *       **Caching:** 60s under `evaluations:detail:{evaluationId}`.
 *       Busted on update / share.
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: evaluationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Evaluation fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EvaluationEnvelope'
 *       400: { description: Malformed evaluationId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Evaluation not found at this company }
 */
evaluationsRouter.get(
    "/:evaluationId",
    validation(EvaluationsValidation.evaluationIdParamSchema, "params"),
    evaluationsService.detail,
)

/**
 * @swagger
 * /company/{companyId}/evaluations/{evaluationId}:
 *   patch:
 *     summary: Update an evaluation (only allowed BEFORE share)
 *     description: |
 *       Edit the admin-typed fields on an evaluation. **Refuses
 *       with 400 if `sharedWithIntern: true`** — once the intern
 *       has seen the review, treat it as immutable. There is no
 *       unshare endpoint (open follow-up).
 *
 *       **Re-derives `overallScore` automatically** when the
 *       ratings change. `attendanceRate` is NOT recomputed (the
 *       period is fixed at create time; if attendance changed,
 *       delete this eval and create a new one).
 *
 *       **Mutable fields:** `skillRating`, `teamworkRating`,
 *       `strengths`, `improvements`, `privateNotes`. Period is
 *       NOT mutable — same reason as `attendanceRate`.
 *
 *       **Empty body** is rejected with 400 "At least one field
 *       is required" (Zod refine — no accidental no-ops).
 *
 *       **Caching:** invalidates `evaluations:detail:{evaluationId}`
 *       + `evaluations:list:{companyId}` (prefix).
 *
 *       **No notification** is sent on update. The intern only
 *       finds out when `sharedWithIntern` flips true.
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: evaluationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateEvaluation'
 *     responses:
 *       200:
 *         description: Evaluation updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EvaluationEnvelope'
 *       400:
 *         description: |
 *           Validation error (bad rating, empty body, ratings out
 *           of range) OR the evaluation has already been shared.
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Evaluation not found at this company }
 */
evaluationsRouter.patch(
    "/:evaluationId",
    validation(EvaluationsValidation.evaluationIdParamSchema, "params"),
    validation(EvaluationsValidation.updateEvaluationSchema),
    evaluationsService.update,
)

/**
 * @swagger
 * /company/{companyId}/evaluations/{evaluationId}/share:
 *   patch:
 *     summary: Share an evaluation with the intern
 *     description: |
 *       Atomically:
 *         1. Sets `sharedWithIntern: true`
 *         2. Stamps `sharedAt = now`
 *         3. Fires `EVALUATION_SHARED` to the intern
 *
 *       After this call:
 *         - the evaluation is visible at
 *           `GET /intern/me/:companyId/evaluations` (with
 *           `privateNotes` stripped)
 *         - the admin can no longer PATCH this evaluation
 *           (returns 400 "Cannot edit an evaluation after it has
 *           been shared")
 *         - calling `/share` again is idempotent (returns
 *           "Evaluation was already shared" — no second notification)
 *
 *       **No body** — the path is the whole request.
 *
 *       **Caching:** invalidates `evaluations:detail:{evaluationId}`
 *       + `evaluations:list:{companyId}` (prefix). Note: the
 *       intern-side cache key `evaluations:intern:{internId}:
 *       {companyId}` is NOT flushed here, so the intern sees the
 *       update after at most 60s (the per-company TTL). Low risk
 *       (open follow-up).
 *
 *       **Unshare:** not supported today. If you shared by
 *       mistake, contact engineering to flip the flag manually in
 *       Mongo (or wait for the unshare endpoint in a follow-up).
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: evaluationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Evaluation shared (or was already shared — both are 200)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EvaluationEnvelope'
 *       400: { description: Malformed evaluationId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Evaluation not found at this company }
 */
evaluationsRouter.patch(
    "/:evaluationId/share",
    validation(EvaluationsValidation.evaluationIdParamSchema, "params"),
    evaluationsService.share,
)

/**
 * @swagger
 * components:
 *   schemas:
 *     EvaluationPeriod:
 *       type: object
 *       required: [start, end]
 *       description: Date window the review covers. `end` must be >= `start`.
 *       properties:
 *         start: { type: string, format: date-time, example: '2026-01-01T00:00:00.000Z' }
 *         end:   { type: string, format: date-time, example: '2026-01-31T23:59:59.000Z' }
 *
 *     CreateEvaluation:
 *       type: object
 *       required: [internId, period, skillRating, teamworkRating]
 *       description: |
 *         Body for `POST /company/:companyId/interns/:internId/evaluations`.
 *         The admin never types the derived fields (`attendanceRate`,
 *         `overallScore`, `evaluatorId`, `sharedWithIntern`).
 *       properties:
 *         internId: { type: string, description: 24-char ObjectId }
 *         period: { $ref: '#/components/schemas/EvaluationPeriod' }
 *         skillRating:
 *           type: number
 *           minimum: 0
 *           maximum: 5
 *           description: |
 *             0-5, normalized to the nearest 0.5 by the service
 *             (`Math.round(n * 2) / 2`). 4.3 → 4.5.
 *         teamworkRating:
 *           type: number
 *           minimum: 0
 *           maximum: 5
 *           description: |
 *             0-5, same half-step rounding as `skillRating`.
 *         strengths: { type: string, minLength: 1, maxLength: 2000 }
 *         improvements: { type: string, minLength: 1, maxLength: 2000 }
 *         privateNotes:
 *           type: string
 *           minLength: 1
 *           maxLength: 5000
 *           description: Admin-only. Stripped from the intern-side response.
 *
 *     UpdateEvaluation:
 *       type: object
 *       description: |
 *         Body for `PATCH /company/:companyId/evaluations/:evaluationId`.
 *         At least one field required. `period` is NOT mutable.
 *         Refused with 400 if the evaluation has already been shared.
 *       minProperties: 1
 *       properties:
 *         skillRating: { type: number, minimum: 0, maximum: 5 }
 *         teamworkRating: { type: number, minimum: 0, maximum: 5 }
 *         strengths: { type: string, minLength: 1, maxLength: 2000 }
 *         improvements: { type: string, minLength: 1, maxLength: 2000 }
 *         privateNotes: { type: string, minLength: 1, maxLength: 5000 }
 *
 *     Pagination:
 *       type: object
 *       properties:
 *         page: { type: integer, minimum: 1, example: 1 }
 *         limit: { type: integer, minimum: 1, maximum: 100, example: 20 }
 *         total: { type: integer, example: 42 }
 *         pages: { type: integer, example: 3 }
 *
 *     Evaluation:
 *       type: object
 *       description: |
 *         The full admin-side document. `privateNotes` is included
 *         here — the intern-side projection (`EvaluationShared`)
 *         strips it.
 *       properties:
 *         _id: { type: string, description: 24-char ObjectId }
 *         internId: { type: string }
 *         companyId: { type: string }
 *         evaluatorId: { type: string, description: Admin who wrote it }
 *         period: { $ref: '#/components/schemas/EvaluationPeriod' }
 *         attendanceRate:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           description: 'Computed: percent of attendance rows in the period with status ∈ {attended, late}'
 *         skillRating: { type: number, minimum: 0, maximum: 5 }
 *         teamworkRating: { type: number, minimum: 0, maximum: 5 }
 *         overallScore:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           description: |
 *             Computed: 0.3 * attendanceRate + 0.3 * skillPct
 *             + 0.2 * teamworkPct + 0.2 * engagementScore (0 today).
 *         strengths: { type: string, maxLength: 2000 }
 *         improvements: { type: string, maxLength: 2000 }
 *         privateNotes:
 *           type: string
 *           maxLength: 5000
 *           description: Admin-only — stripped on the intern-side projection.
 *         evaluatedAt: { type: string, format: date-time }
 *         sharedWithIntern: { type: boolean, default: false }
 *         sharedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Stamped when the admin hits /share.
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     EvaluationShared:
 *       allOf:
 *         - $ref: '#/components/schemas/Evaluation'
 *       description: |
 *         Intern-side projection. Identical to `Evaluation` but
 *         **without** `privateNotes`. This is what the intern sees
 *         when `sharedWithIntern: true`.
 *
 *     EvaluationEnvelope:
 *       type: object
 *       properties:
 *         evaluation: { $ref: '#/components/schemas/Evaluation' }
 *
 *     ListEvaluationsResponse:
 *       type: object
 *       properties:
 *         evaluations:
 *           type: array
 *           items: { $ref: '#/components/schemas/Evaluation' }
 *         pagination: { $ref: '#/components/schemas/Pagination' }
 *
 *     EvaluationKpis:
 *       type: object
 *       description: |
 *         Company-wide KPIs for the Evaluations dashboard tab.
 *         Computed by `companyKpis()` in `src/utils/aggregations/evaluation.ts`.
 *       properties:
 *         avgAttendance:
 *           type: number
 *           description: 'Percent of attendance rows in the last 30 days with status ∈ {attended, late}, rounded to 2 decimals'
 *         avgSkillRating:
 *           type: number
 *           description: Mean of `skillRating` across all evaluations ever (no time window)
 *         avgOverallScore:
 *           type: number
 *           description: Mean of `overallScore` across all evaluations ever
 *         evaluationsThisMonth:
 *           type: integer
 *           description: Count of evaluations where `evaluatedAt` is in the current UTC month
 *
 *     EvaluationChartPoint:
 *       type: object
 *       description: One month's worth of attendance data for the dashboard chart.
 *       properties:
 *         month: { type: string, example: '2026-09', description: 'YYYY-MM (UTC month boundary)' }
 *         presentDays: { type: integer, example: 18 }
 *         totalDays: { type: integer, example: 22 }
 *         rate:
 *           type: number
 *           example: 81.82
 *           description: 'presentDays / totalDays * 100, rounded to 2 decimals (or 0 if totalDays = 0)'
 *
 *     EvaluationDashboardResponse:
 *       type: object
 *       properties:
 *         kpis: { $ref: '#/components/schemas/EvaluationKpis' }
 *         chart:
 *           type: array
 *           description: Last 6 months, oldest first
 *           items: { $ref: '#/components/schemas/EvaluationChartPoint' }
 *
 *     InternSummary:
 *       type: object
 *       description: Compact intern summary used inside the alerts response.
 *       properties:
 *         _id: { type: string }
 *         firstName: { type: string }
 *         lastName: { type: string }
 *         email: { type: string, format: email }
 *         profilePicture: { type: string, nullable: true }
 *
 *     LowAttendanceAlert:
 *       type: object
 *       properties:
 *         intern: { $ref: '#/components/schemas/InternSummary' }
 *         attendanceRate:
 *           type: number
 *           description: 'Percent (0-100) of attendance rows in the last 30 days with status ∈ {attended, late}'
 *         windowDays: { type: integer, example: 30 }
 *
 *     OverdueEvaluationAlert:
 *       type: object
 *       properties:
 *         intern: { $ref: '#/components/schemas/InternSummary' }
 *         lastEvaluatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Most recent evaluation's `evaluatedAt`, or null if none.
 *
 *     EvaluationAlerts:
 *       type: object
 *       description: |
 *         Response shape of `GET /company/:companyId/evaluations/alerts`.
 *         Both arrays are empty when no alerts are firing.
 *       properties:
 *         lowAttendance:
 *           type: array
 *           items: { $ref: '#/components/schemas/LowAttendanceAlert' }
 *         evaluationOverdue:
 *           type: array
 *           items: { $ref: '#/components/schemas/OverdueEvaluationAlert' }
 */

export { evaluationsRouter }
