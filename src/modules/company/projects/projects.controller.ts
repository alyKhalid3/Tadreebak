import { Router } from "express"
import { ProjectsService } from "./projects.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import * as ProjectsValidation from "./projects.validation"

const projectsService = new ProjectsService()

// Company-scoped router — mounted at /company/:companyId/projects
// Inherits :companyId via mergeParams.
const projectsRouter = Router({ mergeParams: true })

/**
 * @swagger
 * /company/{companyId}/projects:
 *   get:
 *     summary: List projects for a company
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 */
projectsRouter.get(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProjectsValidation.listProjectsQuerySchema, "query"),
    projectsService.list,
)

/**
 * @swagger
 * /company/{companyId}/projects:
 *   post:
 *     summary: Create a project
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 */
projectsRouter.post(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProjectsValidation.createProjectSchema),
    projectsService.create,
)

/**
 * @swagger
 * /company/{companyId}/projects/{projectId}:
 *   get:
 *     summary: Get a project by id
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 */
projectsRouter.get(
    "/:projectId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProjectsValidation.projectIdParamSchema, "params"),
    projectsService.detail,
)

/**
 * @swagger
 * /company/{companyId}/projects/{projectId}:
 *   patch:
 *     summary: Update a project
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 */
projectsRouter.patch(
    "/:projectId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProjectsValidation.projectIdParamSchema, "params"),
    validation(ProjectsValidation.updateProjectSchema),
    projectsService.update,
)

/**
 * @swagger
 * /company/{companyId}/projects/{projectId}:
 *   delete:
 *     summary: Archive a project (soft delete)
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 */
projectsRouter.delete(
    "/:projectId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProjectsValidation.projectIdParamSchema, "params"),
    projectsService.archive,
)

/**
 * @swagger
 * /company/{companyId}/projects/{projectId}/interns:
 *   post:
 *     summary: Assign interns to a project
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 */
projectsRouter.post(
    "/:projectId/interns",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProjectsValidation.projectIdParamSchema, "params"),
    validation(ProjectsValidation.assignInternsSchema),
    projectsService.assignInterns,
)

export { projectsRouter }
