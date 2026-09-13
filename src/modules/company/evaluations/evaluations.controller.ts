// Phase 4 — Evaluations company-side controller. Mirrors the
// projects / tasks controller shape: merged-params, auth + role
// guard, validation middleware with explicit `source`.

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
 *     summary: List evaluations (filter by internId / period)
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
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
 *     summary: Aggregated KPIs + 6-month chart
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 */
evaluationsRouter.get(
    "/dashboard",
    evaluationsService.dashboard,
)

/**
 * @swagger
 * /company/{companyId}/evaluations/alerts:
 *   get:
 *     summary: Interns with low attendance or overdue evaluations
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 */
evaluationsRouter.get(
    "/alerts",
    evaluationsService.alerts,
)

/**
 * @swagger
 * /company/{companyId}/interns/{internId}/evaluations:
 *   post:
 *     summary: Create an evaluation
 *     description: |
 *       Intern must be enrolled at this company. The service computes
 *       `attendanceRate` (from the intern's check-ins over the period)
 *       and `overallScore` (weighted: 30/30/20/20 attendance/skill/
 *       teamwork/engagement).
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
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
 *     summary: Evaluation detail
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
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
 *     summary: Update an evaluation (only allowed before share)
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
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
 *       Flips `sharedWithIntern` to true and notifies the intern.
 *       After this, the evaluation is read-only on the admin side
 *       and visible to the intern via `/intern/me/evaluations`.
 *     tags: [Dashboard - Evaluations]
 *     security:
 *       - bearerAuth: []
 */
evaluationsRouter.patch(
    "/:evaluationId/share",
    validation(EvaluationsValidation.evaluationIdParamSchema, "params"),
    evaluationsService.share,
)

export { evaluationsRouter }
