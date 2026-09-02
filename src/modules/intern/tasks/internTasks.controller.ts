// Phase 2 — intern-side tasks controller. Mounted at /api/v1/intern/me/tasks.
// The intern must be authenticated; the user's role is `intern` (set
// when their application was accepted). The service scope-checks by
// `internId === user._id` so the intern can never read or mutate
// another intern's task.

import { Router } from "express"
import { InternTasksService } from "./internTasks.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../../DB/types/user.type"
import * as TasksValidation from "../../company/tasks/tasks.validation"

const internTasksService = new InternTasksService()

// Reuse the same listTasksQuerySchema as the company side — the
// filters are a strict subset. We only use status/sort/page/limit.
const listMineQuerySchema = TasksValidation.listTasksQuerySchema.pick({
    status: true,
    sort: true,
    page: true,
    limit: true,
})

const internTasksRouter = Router()

/**
 * @swagger
 * /intern/me/tasks:
 *   get:
 *     summary: List my tasks (intern only)
 *     description: |
 *       Returns non-archived tasks assigned to the authenticated intern.
 *       Default sort `dueDate` ascending. Use `status` to filter to a
 *       single kanban column.
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 */
internTasksRouter.get(
    "/",
    auth(),
    AuthZMiddleware([UserRoleEnum.INTERN]),
    validation(listMineQuerySchema, "query"),
    internTasksService.listMine,
)

/**
 * @swagger
 * /intern/me/tasks/{taskId}:
 *   get:
 *     summary: Get one of my tasks (intern only)
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 */
internTasksRouter.get(
    "/:taskId",
    auth(),
    AuthZMiddleware([UserRoleEnum.INTERN]),
    validation(TasksValidation.taskIdParamSchema, "params"),
    internTasksService.detail,
)

/**
 * @swagger
 * /intern/me/tasks/{taskId}/start:
 *   post:
 *     summary: Mark a task as in-progress (todo → in_progress)
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 */
internTasksRouter.post(
    "/:taskId/start",
    auth(),
    AuthZMiddleware([UserRoleEnum.INTERN]),
    validation(TasksValidation.taskIdParamSchema, "params"),
    internTasksService.start,
)

/**
 * @swagger
 * /intern/me/tasks/{taskId}/submit:
 *   post:
 *     summary: Submit a task for review (in_progress → in_review)
 *     description: |
 *       Body carries an optional `note` (string) which is appended to
 *       the task's reviewer feedback. The assigned admin gets a
 *       TASK_SUBMITTED notification.
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 */
internTasksRouter.post(
    "/:taskId/submit",
    auth(),
    AuthZMiddleware([UserRoleEnum.INTERN]),
    validation(TasksValidation.taskIdParamSchema, "params"),
    validation(TasksValidation.submitTaskSchema),
    internTasksService.submit,
)

export { internTasksRouter }
