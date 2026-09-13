// Phase 2 + Phase 6: Tasks company-side controller + broadcast support.
//
// Phase 6 additions:
//   - POST /api/v1/company/:companyId/tasks now accepts a
//     discriminated-union body with `target: 'company' | 'program' |
//     'project' | 'intern'`. The service fans out one task row per
//     member of the chosen target; the rows share a taskGroupId.
//   - GET  /api/v1/company/:companyId/tasks/group/:groupId returns
//     every row in a broadcast, joined with intern name+email.
//   - PATCH /api/v1/company/:companyId/tasks/group/:groupId applies
//     the same fields (title, description, priority, tags, dueDate)
//     to every row in the broadcast in one query.
//
// Mirrors the projects / programs / internMe controller shape:
// merged-params, auth + COMPANY_OWNER guard, validation middleware
// with explicit `source` for non-body inputs. The swagger JSDoc on
// each route documents the 4 target modes explicitly so the
// frontend team can pick the right shape without guessing.

import { Router } from "express"
import { TasksService } from "./tasks.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import * as TasksValidation from "./tasks.validation"
import { fileTypes, StoreIn, uploadFile } from "../../../utils/multer/multer"

const tasksService = new TasksService()

// Company-scoped router — mounted at /company/:companyId/tasks
// Inherits :companyId via mergeParams.
const tasksRouter = Router({ mergeParams: true })

/**
 * @swagger
 * /company/{companyId}/tasks:
 *   get:
 *     summary: List tasks (kanban view) for a company
 *     description: |
 *       Returns non-archived tasks with optional filters. Default sort is
 *       `dueDate` ascending. The kanban UI groups by `status` client-side.
 *       Use `?taskGroupId=` to scope the list to a single broadcast
 *       (every row in the broadcast shares the same id).
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: taskGroupId
 *         schema: { type: string }
 *         description: Optional — filter to a single broadcast group
 *     responses:
 *       200: { description: Tasks fetched }
 *       400: { description: Bad query }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 */
tasksRouter.get(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.listTasksQuerySchema, "query"),
    tasksService.list,
)

/**
 * @swagger
 * /company/{companyId}/tasks:
 *   post:
 *     summary: Create a task (single or broadcast)
 *     description: |
 *       Multipart. Body is JSON in the form, file field is `files`
 *       (up to 10). The body's `target` field is a discriminator:
 *
 *       - `target: "company"` — fan out to every active intern at this
 *         company. No extra id needed.
 *       - `target: "program"` — fan out to every intern in
 *         `programId` (must belong to this company).
 *       - `target: "project"` — fan out to every intern in
 *         `projectId` (must belong to this company).
 *       - `target: "intern"`  — single recipient; `internId` required.
 *
 *       For broadcast targets (company / program / project), one
 *       task row is created per active member and they all share
 *       the same `taskGroupId` in the response. If the target has
 *       zero active members, the endpoint returns **400**.
 *
 *       Each intern gets one `TASK_ASSIGNED` notification. The
 *       response shape differs by target:
 *
 *       - `target: "intern"` → `{ task }` (one row)
 *       - broadcast          → `{ tasks, count, groupId, target, members }`
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/CreateCompanyTask'
 *               - $ref: '#/components/schemas/CreateProgramTask'
 *               - $ref: '#/components/schemas/CreateProjectTask'
 *               - $ref: '#/components/schemas/CreateInternTask'
 *           examples:
 *             wholeCompany:
 *               summary: Broadcast to every active intern at this company
 *               value:
 *                 target: company
 *                 title: Read the company handbook
 *                 description: Cover sections 1-3 by end of week
 *                 dueDate: 2026-09-15T23:59:59.000Z
 *                 priority: medium
 *             program:
 *               summary: Broadcast to every intern in a program
 *               value:
 *                 target: program
 *                 programId: 6ab1c2d3e4f5a6b7c8d9e0a1
 *                 title: Submit your weekly reflection
 *                 description: ...
 *                 dueDate: 2026-09-15T23:59:59.000Z
 *             project:
 *               summary: Broadcast to every intern on a project
 *               value:
 *                 target: project
 *                 projectId: 6ab1c2d3e4f5a6b7c8d9e0a2
 *                 title: Code review session prep
 *                 description: ...
 *                 dueDate: 2026-09-15T23:59:59.000Z
 *             singleIntern:
 *               summary: Assign to one intern
 *               value:
 *                 target: intern
 *                 internId: 6ab1c2d3e4f5a6b7c8d9e0a3
 *                 title: 1:1 prep
 *                 description: Bring your questions
 *                 dueDate: 2026-09-15T23:59:59.000Z
 *     responses:
 *       201:
 *         description: Task(s) created
 *       400: { description: Validation error, no active members, or invalid target }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Program / project / intern not found at this company }
 */
tasksRouter.post(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.createTaskSchema),
    uploadFile({
        fileType: [...fileTypes.images, ...fileTypes.pdf],
        storeIn: StoreIn.DISK,
    }).array("files", 10),
    tasksService.create,
)

/**
 * @swagger
 * /company/{companyId}/tasks/group/{groupId}:
 *   get:
 *     summary: List every task in a single broadcast
 *     description: |
 *       Returns every task row that shares the given `taskGroupId` at
 *       this company, populated with the intern's name + email so the
 *       admin can see per-member status at a glance.
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: string }
 *         description: The taskGroupId returned by the create endpoint
 *     responses:
 *       200: { description: Broadcast tasks fetched }
 *       400: { description: Invalid groupId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Broadcast not found }
 */
tasksRouter.get(
    "/group/:groupId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.taskGroupIdParamSchema, "params"),
    tasksService.listByGroup,
)

/**
 * @swagger
 * /company/{companyId}/tasks/group/{groupId}:
 *   patch:
 *     summary: Bulk-update every task in a single broadcast
 *     description: |
 *       Applies the same edits to every task row that shares the
 *       `taskGroupId` in one Mongo round-trip. Useful for "extend
 *       the due date for everyone", "bump priority", or "retag".
 *
 *       Fields allowed: `title`, `description`, `priority`, `tags`,
 *       `dueDate`. At least one is required.
 *
 *       Fields NOT allowed (identity is immutable after creation):
 *       `internId`, `projectId`, `programId`, `attachments`, `status`
 *       (use `/transition` for status changes).
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkUpdateBroadcast'
 *     responses:
 *       200: { description: Broadcast updated }
 *       400: { description: Invalid groupId, no fields, or bad values }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Broadcast not found }
 */
tasksRouter.patch(
    "/group/:groupId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.taskGroupIdParamSchema, "params"),
    validation(TasksValidation.bulkUpdateTaskSchema),
    tasksService.bulkUpdateByGroup,
)

/**
 * @swagger
 * /company/{companyId}/tasks/{taskId}:
 *   get:
 *     summary: Get a task by id
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 */
tasksRouter.get(
    "/:taskId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.taskIdParamSchema, "params"),
    tasksService.detail,
)

/**
 * @swagger
 * /company/{companyId}/tasks/{taskId}:
 *   patch:
 *     summary: Update a single task (admin only, no status change here)
 *     description: |
 *       Edit title, description, priority, tags, dueDate, project, program.
 *       Use `POST /:taskId/transition` to change status. Use
 *       `POST /:taskId/feedback` to record a review comment.
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 */
tasksRouter.patch(
    "/:taskId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.taskIdParamSchema, "params"),
    validation(TasksValidation.updateTaskSchema),
    tasksService.update,
)

/**
 * @swagger
 * /company/{companyId}/tasks/{taskId}:
 *   delete:
 *     summary: Archive a single task (soft delete)
 *     description: |
 *       Sets `status: "archived"`. To archive an entire broadcast,
 *       use PATCH /tasks/group/:groupId with a new dueDate / title
 *       and then archive each row via the loop, or add a dedicated
 *       bulk-archive endpoint in a follow-up.
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 */
tasksRouter.delete(
    "/:taskId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.taskIdParamSchema, "params"),
    tasksService.archive,
)

/**
 * @swagger
 * /company/{companyId}/tasks/{taskId}/transition:
 *   post:
 *     summary: Move a task through the kanban state machine
 *     description: |
 *       Allowed transitions:
 *       - todo       → in_progress | complete
 *       - in_progress → in_review | complete
 *       - in_review  → in_progress | complete
 *
 *       On `complete`, the intern gets a TASK_REVIEWED notification
 *       and (if `pointsAwarded` is provided) the points are recorded.
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 */
tasksRouter.post(
    "/:taskId/transition",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.taskIdParamSchema, "params"),
    validation(TasksValidation.transitionTaskSchema),
    tasksService.transition,
)

/**
 * @swagger
 * /company/{companyId}/tasks/{taskId}/feedback:
 *   post:
 *     summary: Save reviewer feedback without changing status
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 */
tasksRouter.post(
    "/:taskId/feedback",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.taskIdParamSchema, "params"),
    validation(TasksValidation.feedbackTaskSchema),
    tasksService.feedback,
)

/**
 * @swagger
 * /company/{companyId}/tasks/{taskId}/attachments:
 *   post:
 *     summary: Add attachments to a single task (multipart, up to 10)
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 */
tasksRouter.post(
    "/:taskId/attachments",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.taskIdParamSchema, "params"),
    uploadFile({
        fileType: [...fileTypes.images, ...fileTypes.pdf],
        storeIn: StoreIn.DISK,
    }).array("files", 10),
    tasksService.addAttachments,
)

/**
 * @swagger
 * /company/{companyId}/tasks/{taskId}/attachments/{attachmentId}:
 *   delete:
 *     summary: Remove an attachment from a single task (DB + best-effort Cloudinary delete)
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 */
tasksRouter.delete(
    "/:taskId/attachments/:attachmentId",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    tasksService.removeAttachment,
)

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateCompanyTask:
 *       type: object
 *       required: [target, title, description, dueDate]
 *       properties:
 *         target: { type: string, enum: [company] }
 *         title: { type: string, minLength: 2, maxLength: 200 }
 *         description: { type: string, minLength: 1, maxLength: 5000 }
 *         priority: { type: string, enum: [high, medium, low], default: medium }
 *         tags: { type: array, items: { type: string, maxLength: 32 }, maxItems: 20 }
 *         dueDate: { type: string, format: date-time }
 *         projectId: { type: string, description: Optional context }
 *         programId: { type: string, description: Optional context }
 *         attachments: { type: array, items: { $ref: '#/components/schemas/Attachment' } }
 *     CreateProgramTask:
 *       allOf:
 *         - $ref: '#/components/schemas/CreateCompanyTask'
 *         - type: object
 *           required: [programId]
 *           properties:
 *             target: { type: string, enum: [program] }
 *             programId: { type: string }
 *     CreateProjectTask:
 *       allOf:
 *         - $ref: '#/components/schemas/CreateCompanyTask'
 *         - type: object
 *           required: [projectId]
 *           properties:
 *             target: { type: string, enum: [project] }
 *             projectId: { type: string }
 *     CreateInternTask:
 *       allOf:
 *         - $ref: '#/components/schemas/CreateCompanyTask'
 *         - type: object
 *           required: [internId]
 *           properties:
 *             target: { type: string, enum: [intern] }
 *             internId: { type: string }
 *     BulkUpdateBroadcast:
 *       type: object
 *       description: |
 *         At least one field required. Applied to every task row in
 *         the broadcast. Status / internId / projectId / programId /
 *         attachments are NOT allowed here.
 *       properties:
 *         title: { type: string, minLength: 2, maxLength: 200 }
 *         description: { type: string, minLength: 1, maxLength: 5000 }
 *         priority: { type: string, enum: [high, medium, low] }
 *         tags: { type: array, items: { type: string, maxLength: 32 }, maxItems: 20 }
 *         dueDate: { type: string, format: date-time }
 *     Attachment:
 *       type: object
 *       properties:
 *         public_id: { type: string }
 *         secure_url: { type: string, format: uri }
 *         name: { type: string, maxLength: 255 }
 *         mimeType: { type: string, maxLength: 127 }
 *         size: { type: integer, maximum: 10485760 }
 */

export { tasksRouter }
