// Phase 5 — intern-side task endpoints, scoped to a single company.
//
// The intern is enrolled at many companies (Phase 5); each task lives
// at exactly one company. The intern must be authenticated, must be
// an active intern at the given company, and the service scope-checks
// by both `internId` and `companyId` so the intern can never read or
// mutate another company's task while viewing the current one.
//
// Mounted at /api/v1/intern/me/:companyId/tasks (see routes.ts).
//
// State machine matches the company-side ALLOWED_TRANSITIONS table.

import { Router } from "express"
import { InternTasksService } from "./internTasks.service"
import { validation } from "../../../middleware/validation.middleware"
import { auth } from "../../../middleware/authentication.middleware"
import { requireIntern } from "../../../middleware/authorization.middleware"
import { z } from "zod"
import * as TasksValidation from "../../company/tasks/tasks.validation"

const internTasksService = new InternTasksService()

// 24-char ObjectId for the :companyId path param.
const companyIdParamSchema = z.object({
    companyId: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid company id"),
})

// Reuse the same listTasksQuerySchema as the company side — the
// filters are a strict subset. We only use status/sort/page/limit.
const listMineQuerySchema = TasksValidation.listTasksQuerySchema.pick({
    status: true,
    sort: true,
    page: true,
    limit: true,
})

// mergeParams: true so :companyId from the parent mount is inherited.
const internTasksRouter = Router({ mergeParams: true })

internTasksRouter.use(auth(), requireIntern())

/**
 * @swagger
 * /intern/me/{companyId}/tasks:
 *   get:
 *     summary: List my tasks at this company (intern only)
 *     description: |
 *       Returns non-archived tasks assigned to the authenticated
 *       intern AND belonging to the company in the path. Default
 *       sort `dueDate` ascending. Use `status` to filter to a
 *       single kanban column. The intern must be actively
 *       enrolled at this company; otherwise 404.
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 */
internTasksRouter.get(
    "/",
    validation(companyIdParamSchema, "params"),
    validation(listMineQuerySchema, "query"),
    internTasksService.listMine,
)

/**
 * @swagger
 * /intern/me/{companyId}/tasks/{taskId}:
 *   get:
 *     summary: Get one of my tasks at this company
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 */
internTasksRouter.get(
    "/:taskId",
    validation(companyIdParamSchema, "params"),
    validation(TasksValidation.taskIdParamSchema, "params"),
    internTasksService.detail,
)

/**
 * @swagger
 * /intern/me/{companyId}/tasks/{taskId}/start:
 *   post:
 *     summary: Mark a task as in-progress (todo → in_progress)
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 */
internTasksRouter.post(
    "/:taskId/start",
    validation(companyIdParamSchema, "params"),
    validation(TasksValidation.taskIdParamSchema, "params"),
    internTasksService.start,
)

/**
 * @swagger
 * /intern/me/{companyId}/tasks/{taskId}/submit:
 *   post:
 *     summary: Submit a task for review (in_progress → in_review)
 *     description: |
 *       Body carries an optional `note` (string) which is appended
 *       to the task's reviewer feedback. The company owner at this
 *       company gets a TASK_SUBMITTED notification.
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 */
internTasksRouter.post(
    "/:taskId/submit",
    validation(companyIdParamSchema, "params"),
    validation(TasksValidation.taskIdParamSchema, "params"),
    validation(TasksValidation.submitTaskSchema),
    internTasksService.submit,
)

export { internTasksRouter }
