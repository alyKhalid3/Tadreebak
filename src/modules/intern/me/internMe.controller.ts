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

// ----- Picker -----
/**
 * @swagger
 * /intern/me:
 *   get:
 *     summary: List my enrollments across all companies
 *     description: |
 *       Returns the intern's safe profile + every active /
 *       completed / withdrawn enrollment. The frontend uses this
 *       to render the company picker.
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
 */
internMeRouter.get("/", internMeService.me)

// ----- Per-company: profile view -----
/**
 * @swagger
 * /intern/me/{companyId}:
 *   get:
 *     summary: Per-company view (profile + program + project + taskCounts)
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
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
 *     summary: Per-company: current program
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
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
 *     summary: Per-company: my supervisor
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
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
 *     summary: Per-company: my attendance history (Phase 7 — read-only)
 *     description: |
 *       The intern's attendance at this company. Phase 7 removed
 *       the check-in endpoint — the admin is now the source of
 *       truth, so this is a read-only view.
 *     tags: [Intern - Me]
 *     security:
 *       - bearerAuth: []
 */
internMeRouter.get(
    "/:companyId/attendance",
    validation(MeValidation.companyIdParamSchema, "params"),
    validation(MeValidation.attendanceHistoryQuerySchema, "query"),
    internMeService.attendanceHistory,
)

export { internMeRouter }
