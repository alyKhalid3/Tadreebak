// Phase 2 — Tasks company-side controller. Mirrors the projects
// controller shape: merged-params, auth + COMPANY_OWNER guard,
// validation middleware with explicit `source` for non-body inputs.
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
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
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
 *     summary: Create a task and assign it to an intern
 *     description: |
 *       Multipart. Body fields are JSON (`{...}`) and the file field is
 *       `files` (up to 10). Intern must already be enrolled at this
 *       company. The intern gets a TASK_ASSIGNED notification.
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 */
tasksRouter.post(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    // images + PDFs as raw; multer only restricts by mimetype
    uploadFile({
        fileType: [...fileTypes.images, ...fileTypes.pdf],
        storeIn: StoreIn.DISK,
    }).array("files", 10),
    tasksService.create,
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
 *     summary: Update a task (admin only, no status change here)
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
 *     summary: Archive a task (soft delete)
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
 *     summary: Add attachments to a task (multipart, up to 10)
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
 *     summary: Remove an attachment (DB + best-effort Cloudinary delete)
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

export { tasksRouter }
