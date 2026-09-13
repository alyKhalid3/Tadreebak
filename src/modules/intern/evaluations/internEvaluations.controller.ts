// Phase 5 — intern-side evaluations controller.
//
// Mounted at /api/v1/intern/me/:companyId/evaluations. The intern
// can list their own evaluations AT THIS COMPANY. The :companyId
// scoping ensures the intern can never see Company Y's evaluations
// while viewing Company X.
//
// The service still hard-codes `sharedWithIntern: true` (the
// intern never sees drafts) and strips `privateNotes` (the
// admin-only field).

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
 *       been shared with them AND belong to the company in the
 *       path. Drafts and the admin's private notes are not
 *       exposed. The intern cannot read another intern's reviews.
 *     tags: [Intern - Evaluations]
 *     security:
 *       - bearerAuth: []
 */
internEvaluationsRouter.get(
    "/",
    validation(companyIdParamSchema, "params"),
    validation(EvaluationsValidation.myEvaluationsQuerySchema, "query"),
    internEvaluationsService.listMine,
)

export { internEvaluationsRouter }
