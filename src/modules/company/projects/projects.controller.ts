// Phase 1 — Projects company-side controller.
//
// Mounted at /company/:companyId/projects. All routes require auth +
// COMPANY_OWNER + the company-ownership check inside the service.

import { Router } from "express"
import { ProjectsService } from "./projects.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import { fileTypes, StoreIn, uploadFile } from "../../../utils/multer/multer"
import * as ProjectsValidation from "./projects.validation"

const projectsService = new ProjectsService()

const projectsRouter = Router({ mergeParams: true })

/**
 * @swagger
 * /company/{companyId}/projects:
 *   get:
 *     summary: List projects for a company
 *     description: |
 *       Returns every project owned by this company, newest first
 *       by `createdAt`. Filter by `status` (active / archived) and
 *       `programId` (only projects in that program).
 *
 *       **Caching:** 60s under
 *       `projects:list:{companyId}:{queryHash}`. Busted on every
 *       create / update / archive / assignInterns / replaceAttachment
 *       via `projects:{companyId}` (prefix).
 *
 *       **Pagination:** `page` (default 1) + `limit` (default 20,
 *       max 100).
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         required: false
 *         schema: { type: string, enum: [active, archived] }
 *       - in: query
 *         name: programId
 *         required: false
 *         schema: { type: string }
 *         description: 24-char ObjectId
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Projects fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ListProjectsResponse'
 *       400: { description: Validation error }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
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
 *     summary: Create a project (multipart, optional attachment)
 *     description: |
 *       **Multipart.** Body fields are JSON in the form, the optional
 *       file field is `file` (single — the project's "explanation":
 *       a brief, a spec, or a mockup). The file is uploaded to
 *       Cloudinary and stored as `project.attachment` so the interns
 *       assigned to the project can read it from the project page.
 *
 *       **Allowed file types:** `image/jpeg`, `image/png`, `image/jpg`,
 *       `application/pdf`. Per-file size cap: 2 MB during streaming
 *       (multer `MAX_FILE_SIZE`); the schema validates the resulting
 *       `size` field up to 10 MB. Files outside the allowed types
 *       return **400 "File type is not allowed"**.
 *
 *       **Orphan cleanup:** if the project create fails AFTER the
 *       attachment uploaded to Cloudinary, the orphan file is
 *       destroyed (best-effort). Never leaks storage on create
 *       failure.
 *
 *       Omit the `file` field to create a project without an
 *       attachment.
 *     tags: [Dashboard - Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
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
 *       201:
 *         description: Project created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectEnvelope'
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
 *     description: |
 *       Scoped to `companyId` so a company owner cannot read another
 *       company's project. Returns 404 if the project exists but
 *       belongs to a different company.
 *
 *       **Caching:** 60s under `projects:detail:{projectId}`.
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
 *     responses:
 *       200:
 *         description: Project fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectEnvelope'
 *       400: { description: Malformed projectId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Project not found at this company }
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
 *     summary: Update a project (metadata only)
 *     description: |
 *       Edit any subset of the mutable fields. The body is spread
 *       into the update — empty patches are rejected by Zod refine
 *       "at least one field".
 *
 *       **Does NOT accept a new attachment** — use
 *       `PUT /:projectId/attachment` to swap the attachment
 *       (multipart). The `attachment` field is intentionally not in
 *       the schema so a wrong call gets a clean 400.
 *
 *       **Does NOT mutate `internIds[]`** — use
 *       `POST /:projectId/interns` to add (de-dupes via `$addToSet`).
 *       There is no remove endpoint today (open follow-up — use the
 *       same pattern as programs `DELETE /interns/:internId`).
 *
 *       **Cache flush:** `projects:detail:{projectId}` +
 *       `projects:list:{companyId}` (prefix).
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
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProject'
 *     responses:
 *       200:
 *         description: Project updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectEnvelope'
 *       400: { description: Validation error (empty body, attachment field rejected) }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Project not found at this company }
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
 *     description: |
 *       Marks the project as `status: archived`. Reversible via
 *       `PATCH /:projectId` with `status: active`. Tasks and
 *       evaluations referencing this project stay untouched
 *       (preserved for historical dashboard views).
 *
 *       **Cache flush:** `projects:detail:{projectId}` +
 *       `projects:list:{companyId}` (prefix).
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
 *     responses:
 *       200: { description: Project archived }
 *       400: { description: Malformed projectId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Project not found at this company }
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
 *     summary: Assign interns to a project (de-dupes)
 *     description: |
 *       Uses `$addToSet` — re-sending the same internId is a no-op,
 *       so this endpoint is safe to retry.
 *
 *       **Does NOT check enrollment** — the admin can assign
 *       anyone. (Use the dashboard UI to filter to "active interns"
 *       before sending.)
 *
 *       **Cache flush:** `projects:detail:{projectId}` +
 *       `projects:list:{companyId}` (prefix).
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [internIds]
 *             properties:
 *               internIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 200
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Interns assigned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'Interns assigned to project' }
 *                 project: { $ref: '#/components/schemas/Project' }
 *       400: { description: Validation error }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Project not found at this company }
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
 *     summary: Replace the project's attachment (multipart)
 *     description: |
 *       **Multipart.** Single `file` field. The old attachment (if
 *       any) is destroyed from Cloudinary and a new one is uploaded
 *       and stored on the project. Omitting the `file` field returns
 *       400.
 *
 *       **Atomic swap:** the new file is uploaded FIRST, then the DB
 *       is updated. If the DB update fails, the new Cloudinary file
 *       is destroyed (best-effort) so we don't leak storage. The
 *       OLD file is only destroyed after the DB update succeeds — so
 *       we never lose the old attachment on a failure.
 *
 *       **To clear the attachment entirely**, there is no
 *       `DELETE /attachment` endpoint today (open follow-up). For
 *       now, upload an empty placeholder via PUT.
 *
 *       **Allowed file types:** `image/jpeg`, `image/png`,
 *       `image/jpg`, `application/pdf`. Per-file size cap: 2 MB at
 *       streaming time, 10 MB schema cap.
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
 *                   atomically.
 *     responses:
 *       200:
 *         description: Attachment replaced
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'Project attachment updated successfully' }
 *                 project: { $ref: '#/components/schemas/Project' }
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

/**
 * @swagger
 * components:
 *   schemas:
 *     Project:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         name: { type: string, minLength: 2, maxLength: 100 }
 *         description: { type: string, maxLength: 2000, nullable: true }
 *         companyId: { type: string }
 *         programId: { type: string, nullable: true, description: Optional program binding }
 *         internIds:
 *           type: array
 *           items: { type: string }
 *           description: User ObjectIds currently assigned
 *         status: { type: string, enum: [active, archived] }
 *         startDate: { type: string, format: date-time, nullable: true }
 *         endDate: { type: string, format: date-time, nullable: true }
 *         color: { type: string, nullable: true, description: 'Hex like #10b981' }
 *         attachment:
 *           $ref: '#/components/schemas/Attachment'
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     UpdateProject:
 *       type: object
 *       minProperties: 1
 *       description: 'Empty body rejected. `attachment` is NOT in this schema — use PUT /attachment for that.'
 *       properties:
 *         name: { type: string, minLength: 2, maxLength: 100 }
 *         description: { type: string, maxLength: 2000 }
 *         programId: { type: string, description: 24-char ObjectId }
 *         internIds:
 *           type: array
 *           items: { type: string }
 *           maxItems: 200
 *         status: { type: string, enum: [active, archived] }
 *         startDate: { type: string, format: date-time }
 *         endDate: { type: string, format: date-time, nullable: true }
 *         color: { type: string }
 *
 *     ProjectEnvelope:
 *       type: object
 *       properties:
 *         project: { $ref: '#/components/schemas/Project' }
 *
 *     ListProjectsResponse:
 *       type: object
 *       properties:
 *         projects:
 *           type: array
 *           items: { $ref: '#/components/schemas/Project' }
 *         pagination: { $ref: '#/components/schemas/Pagination' }
 */

export { projectsRouter }
