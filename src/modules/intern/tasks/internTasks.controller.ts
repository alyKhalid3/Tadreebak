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
// State machine matches the company-side ALLOWED_TRANSITIONS table —
// but the intern is restricted to a strict subset (start + submit only).

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
 *       intern AND belonging to the company in the path.
 *
 *       **Three-layer scope check:**
 *         1. `requireIntern()` — role gate (or any active enrollment)
 *         2. `hasActiveEnrollmentAt(user, companyId)` — intern must
 *            be active AT THIS company (404 otherwise)
 *         3. Query filter hard-codes `internId = res.locals.user._id`
 *            AND `companyId = path :companyId` — the intern cannot
 *            pass another user's id and read their tasks.
 *
 *       **Sorts:** `dueDate` (default), `recent` (createdAt desc),
 *       `title` (alpha), `priority` (high → medium → low, with
 *       secondary by dueDate).
 *
 *       **Filter:** `status` — restrict to one kanban column.
 *
 *       **Pagination:** `page` (default 1) + `limit` (default 20,
 *       max 100).
 *
 *       **Caching:** 30s under
 *       `tasks:intern:{internId}:{companyId}:{queryHash}`.
 *     tags: [Intern - Tasks]
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
 *         schema: { type: string, enum: [todo, in_progress, in_review, complete] }
 *       - in: query
 *         name: sort
 *         required: false
 *         schema: { type: string, enum: [recent, dueDate, priority, title], default: dueDate }
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
 *         description: Tasks fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tasks:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Task' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *       400: { description: Validation error }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern (no role and no active enrollment) }
 *       404: { description: Not actively enrolled at this company }
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
 *     description: |
 *       Returns the full task (including `reviewerFeedback`,
 *       `attachments`, `submittedAt`, `reviewedAt`). The query
 *       filters by both `internId` AND `companyId` — a task at
 *       another company can't be read by id guessing.
 *
 *       **Caching:** 30s under `tasks:intern:detail:{taskId}`.
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Task fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task: { $ref: '#/components/schemas/Task' }
 *       400: { description: Malformed taskId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern }
 *       404: { description: Task not found at this company for this intern }
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
 *     description: |
 *       Enforces the **intern** subset of the state machine — this
 *       endpoint accepts ONLY `todo → in_progress`. Any other move
 *       returns 400 "Cannot start a task in status X".
 *
 *       **Cache flush:** `tasks:intern:detail:{taskId}` +
 *       `tasks:intern:{internId}:{companyId}` (prefix) +
 *       `tasks:list:{companyId}` (prefix — admin kanban sees the
 *       change).
 *
 *       **No notification** — admins see the kanban update.
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Task started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task: { $ref: '#/components/schemas/Task' }
 *       400: { description: 'Invalid transition (not in todo) or malformed taskId' }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern at this company }
 *       404: { description: Task not found at this company for this intern }
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
 *       Enforces the **intern** subset of the state machine — this
 *       endpoint accepts ONLY `in_progress → in_review`. Any other
 *       move returns 400 "Cannot submit a task in status X".
 *
 *       **Optional `note`** in the body is **appended** to the
 *       existing `reviewerFeedback` (not overwritten). The result
 *       reads:
 *
 *           [intern note 2026-09-15T10:23:00.000Z]
 *           fixed the off-by-one in pricing
 *
 *       If admin feedback existed before, both blocks are preserved
 *       with a `\n\n` separator. On the next submit, the new note
 *       is appended again. This is deliberate — the admin sees the
 *       full thread.
 *
 *       **Stamps `submittedAt = now`.**
 *
 *       **Notification:** the company owner at this company gets a
 *       `TASK_SUBMITTED` with `{ taskId, taskTitle, internName,
 *       companyId }`.
 *
 *       **Cache flush:** `tasks:intern:detail:{taskId}` +
 *       `tasks:intern:{internId}:{companyId}` (prefix) +
 *       `tasks:list:{companyId}` (prefix).
 *     tags: [Intern - Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, minLength: 1, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: Task submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task: { $ref: '#/components/schemas/Task' }
 *       400: { description: 'Invalid transition (not in_progress) or malformed taskId' }
 *       401: { description: Unauthenticated }
 *       403: { description: Not an intern at this company }
 *       404: { description: Task not found at this company for this intern }
 */
internTasksRouter.post(
    "/:taskId/submit",
    validation(companyIdParamSchema, "params"),
    validation(TasksValidation.taskIdParamSchema, "params"),
    validation(TasksValidation.submitTaskSchema),
    internTasksService.submit,
)

export { internTasksRouter }
