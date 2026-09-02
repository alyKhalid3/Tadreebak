import { Router } from "express"
import { InternsService } from "./interns.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import * as InternsValidation from "./interns.validation"

const internsService = new InternsService()

// Company-scoped router — mounted at /company/:companyId/interns
// Inherits :companyId via mergeParams.
const internsRouter = Router({ mergeParams: true })

/**
 * @swagger
 * /company/{companyId}/interns:
 *   get:
 *     summary: List active and alumni interns of a company
 *     description: |
 *       Returns users with `enrollmentCompanyId === companyId`. Filters by
 *       program, project, status, and free-text search. Sorted by
 *       `enrolledAt` desc by default. Phase 6 will replace this with
 *       the dashboard aggregation endpoint that joins in evaluations.
 *     tags: [Dashboard - Interns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: programId
 *         schema: { type: string }
 *       - in: query
 *         name: projectId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, alumni, all], default: all }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on firstName, lastName, or email
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [recent, name, points], default: recent }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200: { description: Interns fetched successfully }
 *       403: { description: Not the company owner }
 *       404: { description: programId/projectId not found }
 */
internsRouter.get(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(InternsValidation.listInternsQuerySchema, "query"),
    internsService.list,
)

/**
 * @swagger
 * /company/{companyId}/interns/{internId}:
 *   get:
 *     summary: Get a single intern's full profile (within this company)
 *     description: |
 *       Returns the intern user doc minus sensitive auth fields. 404 if
 *       the intern is not enrolled at this company (security: a company
 *       owner cannot look up interns of another company even with a
 *       valid id).
 *     tags: [Dashboard - Interns]
 *     security:
 *       - bearerAuth: []
 */
internsRouter.get(
    "/:internId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(InternsValidation.internIdParamSchema, "params"),
    internsService.detail,
)

export { internsRouter }
