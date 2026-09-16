// Phase 5 — intern self-service controller. Mounted at /api/v1/intern/me.
//
// Two-level navigation:
//   GET /me                  → list of my enrollments (picker)
//   GET /me/:companyId/*     → per-company view
//
// All per-company endpoints are scoped to the (user, companyId) pair.
// The intern cannot see Company Y's data while viewing Company X —
// both because the URL has :companyId AND because the service
// re-checks hasActiveEnrollmentAt(user, companyId) on every call.

import { Router } from "express"
import { InternMeService } from "./internMe.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { requireIntern } from "../../../middleware/authorization.middleware"
import * as MeValidation from "./internMe.validation"

const internMeService = new InternMeService()

const internMeRouter = Router({ mergeParams: false })

internMeRouter.use(auth(), requireIntern())

/**
 * @swagger
 * /intern/me:
 *   get:
 *     summary: List my enrollments across all companies (picker)
 *     description: |
 *       Returns the intern's safe profile + every enrollment (active
 *       / completed / withdrawn), with each enrollment's company
 *       hydrated (name, logo, industry). The frontend uses this to
 *       render the company picker — the user picks which company to
 *       "log in to" from this list.
 *
 *       **No `companyId` in the path** — this is the global view.
 *
 *       **Cache:** 30s under `intern:enrollments:{userId}`. Flushed
 *       on application accept (Phase 5 — the picker must refresh
 *       immediately after a new acceptance).
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My enrollments fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     profile: { $ref: '#/components/schemas/User' }
 *                     enrollments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           companyId: { type: string }
 *                           status: { type: string, enum: [active, completed, withdrawn] }
 *                           enrolledAt: { type: string, format: date-time }
 *                           internshipStartDate: { type: string, format: date-time }
 *                           internshipEndDate: { type: string, format: date-time, nullable: true }
 *                           totalPoints: { type: integer }
 *                           company:
 *                             type: object
 *                             properties:
 *                               _id: { type: string }
 *                               name: { type: string }
 *                               logo:
 *                                 type: object
 *                                 nullable: true
 *                                 properties:
 *                                   public_id: { type: string }
 *                                   secure_url: { type: string }
 *                               industry: { type: string }
 *                 msg: { type: string, example: 'My enrollments fetched successfully' }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern (no role and no active enrollment) }
 */
internMeRouter.get("/", internMeService.me)

/**
 * @swagger
 * /intern/me/{companyId}:
 *   get:
 *     summary: Per-company profile view
 *     description: |
 *       Returns the intern's profile + the current program at this
 *       company + the current project + a breakdown of task counts by
 *       status + the enrollment meta (dates + points).
 *
 *       **Scope check:** 404 if the intern is NOT actively enrolled
 *       at this company (defense in depth — the URL has :companyId,
 *       the service re-checks).
 *
 *       **Cache:** 30s under `intern:me:{userId}:{companyId}`.
 *
 *       **`taskCounts`** are aggregated server-side: counts of the
 *       intern's tasks at this company grouped by `status` (excludes
 *       archived). Used by the per-company dashboard quick-glance
 *       cards.
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Per-company profile fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     profile: { $ref: '#/components/schemas/User' }
 *                     program:
 *                       type: object
 *                       nullable: true
 *                       description: Current program at this company (or null)
 *                     project:
 *                       type: object
 *                       nullable: true
 *                       description: Current project at this company (or null)
 *                     taskCounts:
 *                       type: object
 *                       properties:
 *                         todo: { type: integer }
 *                         in_progress: { type: integer }
 *                         in_review: { type: integer }
 *                         complete: { type: integer }
 *                     enrollment:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         enrolledAt: { type: string, format: date-time }
 *                         internshipStartDate: { type: string, format: date-time }
 *                         internshipEndDate: { type: string, format: date-time, nullable: true }
 *                         totalPoints: { type: integer }
 *       400: { description: Malformed companyId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern }
 *       404: { description: Not actively enrolled at this company }
 */
internMeRouter.get(
    "/:companyId",
    validation(MeValidation.companyIdParamSchema, "params"),
    internMeService.meByCompany,
)

/**
 * @swagger
 * /intern/me/{companyId}/program:
 *   get:
 *     summary: 'Per-company: current program'
 *     description: |
 *       Returns the current program at this company. The lookup
 *       prefers an `ACTIVE` program (status filter), falling back to
 *       the most recently created program that has this intern on its
 *       `internIds[]`.
 *
 *       **Cache:** 30s under `intern:me:program:{userId}:{companyId}`.
 *
 *       **404** if the intern has no program at this company (either
 *       they're not on any `internIds[]` list, or no programs exist).
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Current program fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     program: { $ref: '#/components/schemas/Program' }
 *                 msg: { type: string, example: 'Current program fetched successfully' }
 *       400: { description: Malformed companyId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern }
 *       404: { description: No program found for your enrollment at this company }
 */
internMeRouter.get(
    "/:companyId/program",
    validation(MeValidation.companyIdParamSchema, "params"),
    internMeService.program,
)

/**
 * @swagger
 * /intern/me/{companyId}/supervisor:
 *   get:
 *     summary: 'Per-company: my supervisor'
 *     description: |
 *       Returns the company name + the company owner (the supervisor
 *       for this company's interns). The supervisor is populated with
 *       `firstName`, `lastName`, `email`, `profilePicture`, and
 *       `phoneNumber`.
 *
 *       **No cache** — this is a small lookup, hit on the contact
 *       page.
 *
 *       **404** if the company doesn't exist (different from "not
 *       enrolled at this company" — that's a 404 too, but a different
 *       message).
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Supervisor fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     company:
 *                       type: object
 *                       properties:
 *                         _id: { type: string }
 *                         name: { type: string }
 *                         logo:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             public_id: { type: string }
 *                             secure_url: { type: string }
 *                     supervisor:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id: { type: string }
 *                         firstName: { type: string }
 *                         lastName: { type: string }
 *                         email: { type: string, format: email }
 *                         profilePicture:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             public_id: { type: string }
 *                             secure_url: { type: string }
 *                         phoneNumber: { type: string, nullable: true }
 *                 msg: { type: string, example: 'Supervisor fetched successfully' }
 *       400: { description: Malformed companyId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern }
 *       404: { description: Company not found or not enrolled here }
 */
internMeRouter.get(
    "/:companyId/supervisor",
    validation(MeValidation.companyIdParamSchema, "params"),
    internMeService.supervisor,
)

/**
 * @swagger
 * /intern/me/{companyId}/attendance:
 *   get:
 *     summary: 'Per-company: my attendance history (read-only)'
 *     description: |
 *       The intern's attendance at this company. Phase 7 removed the
 *       check-in endpoint — the admin is now the source of truth,
 *       so this is a strictly read-only view.
 *
 *       **Filters:**
 *         - `from` / `to` — YYYY-MM-DD date range on the `date` field.
 *           If both omitted, returns the last 20 rows by date desc.
 *         - `page` / `limit` — pagination (default page=1, limit=20,
 *           max 100).
 *
 *       **Statuses:** `attended` / `missed` / `late` / `excused`
 *       (Phase 7 renamed `present → attended`, `absent → missed`).
 *
 *       **No cache** — this is a per-intern view; the cost is bounded
 *       by the limit. Hit on every dashboard page load.
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         required: false
 *         schema: { type: string, description: 'YYYY-MM-DD, inclusive lower bound' }
 *       - in: query
 *         name: to
 *         required: false
 *         schema: { type: string, description: 'YYYY-MM-DD, inclusive upper bound' }
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
 *         description: Attendance fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     attendance:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           internId: { type: string }
 *                           companyId: { type: string }
 *                           date: { type: string, description: 'YYYY-MM-DD' }
 *                           status: { type: string, enum: [attended, missed, late, excused] }
 *                           note: { type: string, nullable: true }
 *                           pointsAwarded: { type: boolean, nullable: true }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *                 msg: { type: string, example: 'Attendance history fetched successfully' }
 *       400: { description: Validation error (bad date format, bad query) }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern }
 *       404: { description: Not enrolled at this company }
 */
internMeRouter.get(
    "/:companyId/attendance",
    validation(MeValidation.companyIdParamSchema, "params"),
    validation(MeValidation.attendanceHistoryQuerySchema, "query"),
    internMeService.attendanceHistory,
)

export { internMeRouter }
