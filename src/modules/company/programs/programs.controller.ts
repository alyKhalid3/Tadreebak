import { Router } from "express"
import { ProgramsService } from "./programs.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import * as ProgramsValidation from "./programs.validation"

const programsService = new ProgramsService()

// Company-scoped router — mounted at /company/:companyId/programs
// Inherits :companyId via mergeParams.
const programsRouter = Router({ mergeParams: true })

/**
 * @swagger
 * /company/{companyId}/programs:
 *   get:
 *     summary: List programs for a company
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [upcoming, active, completed, archived] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200: { description: Programs fetched successfully }
 *       403: { description: Not the company owner }
 */
programsRouter.get(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.listProgramsQuerySchema, "query"),
    programsService.list,
)

/**
 * @swagger
 * /company/{companyId}/programs:
 *   post:
 *     summary: Create a program (cohort)
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 */
programsRouter.post(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.createProgramSchema),
    programsService.create,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}:
 *   get:
 *     summary: Get a program by id
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 */
programsRouter.get(
    "/:programId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.programIdParamSchema, "params"),
    programsService.detail,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}:
 *   patch:
 *     summary: Update a program
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 */
programsRouter.patch(
    "/:programId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.programIdParamSchema, "params"),
    validation(ProgramsValidation.updateProgramSchema),
    programsService.update,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}:
 *   delete:
 *     summary: Archive a program (soft delete)
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 */
programsRouter.delete(
    "/:programId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.programIdParamSchema, "params"),
    programsService.archive,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}/interns:
 *   post:
 *     summary: Bulk-enroll interns into a program
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 */
programsRouter.post(
    "/:programId/interns",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.programIdParamSchema, "params"),
    validation(ProgramsValidation.enrollInternsSchema),
    programsService.enrollInterns,
)

/**
 * @swagger
 * /company/{companyId}/programs/{programId}/interns/{internId}:
 *   delete:
 *     summary: Unenroll a single intern from a program
 *     tags: [Dashboard - Programs]
 *     security:
 *       - bearerAuth: []
 */
programsRouter.delete(
    "/:programId/interns/:internId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProgramsValidation.unenrollInternSchema, "params"),
    programsService.unenrollIntern,
)

export { programsRouter }
