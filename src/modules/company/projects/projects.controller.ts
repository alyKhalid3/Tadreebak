import { Router } from "express"
import { ProjectsService } from "./projects.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import { fileTypes, StoreIn, uploadFile } from "../../../utils/multer/multer"
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
 *     description: |
 *       **Multipart.** Body fields are JSON in the form, the optional
 *       file field is `file` (single — the project's "explanation":
 *       a brief, a spec, or a mockup). The file is uploaded to
 *       Cloudinary and stored as `project.attachment` so the interns
 *       assigned to the project can read it from the project page.
 *
 *       Allowed file types: `image/jpeg`, `image/png`, `image/jpg`,
 *       `application/pdf`. Per-file size cap: 2 MB during streaming
 *       (multer `MAX_FILE_SIZE`); the schema validates the resulting
 *       `size` field up to 10 MB. Files outside the allowed types
 *       return **400 "File type is not allowed"**.
 *
 *       Omit the `file` field to create a project without an
 *       attachment.
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               description: { type: string, maxLength: 2000 }
 *               programId: { type: string, description: 24-char ObjectId }
 *               internIds:
 *                 type: array
 *                 items: { type: string }
 *                 maxItems: 200
 *                 description: 24-char ObjectIds of interns to assign
 *               startDate: { type: string, format: date-time }
 *               endDate: { type: string, format: date-time, nullable: true }
 *               color: { type: string, description: 'Hex like #10b981' }
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: |
 *                   Optional. The project's explanation — a brief,
 *                   spec, or mockup. Single file, max 2 MB at
 *                   stream time, types jpg/png/jpeg/pdf.
 *     responses:
 *       201: { description: Project created }
 *       400: { description: Validation or file-type error }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: programId not found at this company }
 */
projectsRouter.post(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    uploadFile({
        fileType: [...fileTypes.images, ...fileTypes.pdf],
        storeIn: StoreIn.DISK,
    }).single("file"),
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

/**
 * @swagger
 * /company/{companyId}/projects/{projectId}/attachment:
 *   put:
 *     summary: Replace the project's attachment (the explanation)
 *     description: |
 *       **Multipart.** Single `file` field. The old attachment (if
 *       any) is destroyed from Cloudinary and a new one is uploaded
 *       and stored on the project. Omitting the `file` field returns
 *       400. To clear the attachment entirely, use
 *       `DELETE /projects/{projectId}/attachment` (a follow-up if
 *       you need it — say the word).
 *
 *       Allowed file types: `image/jpeg`, `image/png`, `image/jpg`,
 *       `application/pdf`. Per-file size cap: 2 MB at streaming
 *       time, 10 MB schema cap. Files outside the allowed types
 *       return **400 "File type is not allowed"**.
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: |
 *                   Single file (jpg/png/jpeg/pdf, max 2 MB at
 *                   stream time). Replaces the existing attachment
 *                   atomically (the new file is uploaded first; if
 *                   the DB update fails, the new Cloudinary file is
 *                   destroyed so we don't leak storage).
 *     responses:
 *       200: { description: Attachment replaced }
 *       400: { description: No file, or file-type/size error }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Project not found at this company }
 */
projectsRouter.put(
    "/:projectId/attachment",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(ProjectsValidation.projectIdParamSchema, "params"),
    uploadFile({
        fileType: [...fileTypes.images, ...fileTypes.pdf],
        storeIn: StoreIn.DISK,
    }).single("file"),
    projectsService.replaceAttachment,
)

export { projectsRouter }
