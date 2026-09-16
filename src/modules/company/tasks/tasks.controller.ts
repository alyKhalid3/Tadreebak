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
 * /company/{companyId}/tasks/broadcasts:
 *   get:
 *     summary: List broadcast cards (one per taskGroupId, with per-member status)
 *     description: |
 *       Aggregates the per-intern rows into one "broadcast card" per
 *       `taskGroupId`. The intern-side still operates on individual
 *       rows (so per-intern state is independent) — this is purely
 *       a read-time view layer for the admin kanban.
 *
 *       **Filters:**
 *         - `projectId`, `programId`, `priority` — restrict broadcasts
 *           to one scope
 *         - `memberId` — broadcasts that include this intern
 *         - `status` — broadcasts where **at least one member** is in
 *           this status (NOT "all members"). Most useful semantic for
 *           the admin dashboard. For example, `?status=in_review`
 *           surfaces broadcasts that have any pending review work.
 *         - `search` — case-insensitive regex on `title`
 *
 *       **Sort:** newest broadcast first by `createdAt`
 *       (the earliest row's `createdAt`).
 *
 *       **Pagination:** `page` (default 1) + `limit` (default 20,
 *       max 100).
 *
 *       **Cache:** 60s under
 *       `tasks:broadcasts:{companyId}:{queryHash}`. Busted by every
 *       task mutation at this company (create / update / archive /
 *       transition / feedback / addAttachments / removeAttachment /
 *       bulkUpdateByGroup) via the
 *       `tasks:broadcasts:{companyId}` prefix flush.
 *
 *       **Route ordering:** this route must be registered BEFORE
 *       `GET /:taskId` so Express matches the literal `broadcasts`
 *       segment, not as a `:taskId` parameter.
 *     tags: [Dashboard - Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: projectId
 *         required: false
 *         schema: { type: string }
 *         description: 24-char ObjectId
 *       - in: query
 *         name: programId
 *         required: false
 *         schema: { type: string }
 *         description: 24-char ObjectId
 *       - in: query
 *         name: priority
 *         required: false
 *         schema: { type: string, enum: [high, medium, low] }
 *       - in: query
 *         name: status
 *         required: false
 *         schema: { type: string, enum: [todo, in_progress, in_review, complete] }
 *         description: 'Broadcasts where at least one member is in this status'
 *       - in: query
 *         name: memberId
 *         required: false
 *         schema: { type: string }
 *         description: 'Broadcasts that include this intern'
 *       - in: query
 *         name: search
 *         required: false
 *         schema: { type: string, minLength: 1, maxLength: 100 }
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Broadcasts fetched
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ListBroadcastsResponse'
 *       400: { description: Validation error }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 */
tasksRouter.get(
    "/broadcasts",
    auth(),
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]),
    validation(TasksValidation.listBroadcastsQuerySchema, "query"),
    tasksService.listBroadcasts,
)

/**
 * @swagger
 * /company/{companyId}/tasks/{taskId}:
 *   get:
 *     summary: Get a task by id
 *     description: |
 *       Scoped to `companyId` so a company owner cannot read another
 *       company's task. Returns 404 if the task exists but belongs
 *       to a different company.
 *
 *       **Caching:** 60s under `tasks:detail:{taskId}`.
 *     tags: [Dashboard - Tasks]
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
 *       403: { description: Not the company owner }
 *       404: { description: Task not found at this company }
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
 *       Edit `title`, `description`, `priority`, `tags`, `dueDate`,
 *       `projectId`, `programId`.
 *
 *       **Strips `internId`, `attachments`, `status` from the body** —
 *       use `/transition` for status changes (state machine),
 *       `/attachments` for adding files, and there is no re-assign
 *       endpoint today (open follow-up).
 *
 *       **Cache flush:** `tasks:detail:{taskId}` +
 *       `tasks:list:{companyId}` + `tasks:intern:{internId}:{companyId}`
 *       (the affected intern's per-company cache).
 *
 *       **Tags** are lowercased server-side so search/filter stays
 *       consistent regardless of casing on input.
 *     tags: [Dashboard - Tasks]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTask'
 *     responses:
 *       200:
 *         description: Task updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task: { $ref: '#/components/schemas/Task' }
 *       400: { description: Validation error or forbidden field (internId/attachments/status) }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Task not found at this company }
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
 *       Sets `status: archived`. The row stays in the DB and is
 *       excluded from the kanban list by default. Reversible by
 *       PATCH with `status: todo` (or another state).
 *
 *       **To archive an entire broadcast** in one shot, there is
 *       no `DELETE /tasks/group/:groupId` today (open follow-up).
 *       For now: call this endpoint per row in a loop, or hit the
 *       Mongo shell directly.
 *
 *       **Cannot archive from a non-`active` non-`complete` state**
 *       without first transitioning (the state machine rejects it).
 *       Archive is a state on its own, not a transition.
 *
 *       **Cache flush:** `tasks:detail:{taskId}` +
 *       `tasks:list:{companyId}` + `tasks:intern:{internId}:{companyId}`.
 *     tags: [Dashboard - Tasks]
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
 *       200: { description: Task archived }
 *       400: { description: Malformed taskId }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Task not found at this company }
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
 *       Enforces the state machine from `src/utils/taskStateMachine.ts`.
 *       Two actor roles share the machine; this endpoint always acts
 *       as admin (full set of transitions).
 *
 *       **Admin transitions allowed:**
 *       - `todo`        → `in_progress`, `complete`
 *       - `in_progress` → `in_review`, `complete`
 *       - `in_review`   → `in_progress` (send back), `complete`
 *       - `complete`    → terminal (no outgoing)
 *       - `archived`    → terminal (no outgoing — use `/transition` to
 *         move an active task back; archiving is the DELETE endpoint)
 *
 *       **Side effects:**
 *       - `→ complete`: stamps `reviewedAt = now`, accepts optional
 *         `reviewerFeedback` and `pointsAwarded`, fires
 *         `TASK_REVIEWED` with `approved: true` to the intern.
 *       - `in_review → in_progress` (admin send-back): clears
 *         `submittedAt` so the next submit is a fresh one, fires
 *         `TASK_REVIEWED` with `approved: false`.
 *
 *       **400 "Cannot transition from X to Y"** if the move isn't
 *       allowed. **400 "Cannot transition an archived task"** if
 *       the source row is archived.
 *     tags: [Dashboard - Tasks]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to]
 *             properties:
 *               to:
 *                 type: string
 *                 enum: [todo, in_progress, in_review, complete]
 *               reviewerFeedback: { type: string, minLength: 1, maxLength: 2000 }
 *               pointsAwarded: { type: integer, minimum: 0, maximum: 10000 }
 *     responses:
 *       200:
 *         description: Task transitioned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task: { $ref: '#/components/schemas/Task' }
 *       400: { description: Invalid transition or archived task }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Task not found at this company }
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
 *     description: |
 *       For when the admin wants to leave a comment on a task
 *       without transitioning it. Overwrites `reviewerFeedback`
 *       (no append — the intern's `/submit` appends, this replaces).
 *
 *       **Cache flush:** `tasks:detail:{taskId}` +
 *       `tasks:list:{companyId}` (prefix). Intern-side caches are
 *       NOT flushed — the intern sees the new comment after at most
 *       30s when their per-company task list TTL expires (open
 *       follow-up: explicit flush).
 *     tags: [Dashboard - Tasks]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reviewerFeedback]
 *             properties:
 *               reviewerFeedback: { type: string, minLength: 1, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: Feedback saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task: { $ref: '#/components/schemas/Task' }
 *       400: { description: Validation error }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Task not found at this company }
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
 *     description: |
 *       **Multipart.** `files` field, up to 10 files per call.
 *       Per-file upload errors roll back the whole batch — any partial
 *       uploads are best-effort destroyed before the error is thrown.
 *
 *       **Allowed file types:** jpg / png / jpeg / pdf. Per-file
 *       size cap: 10 MB at the schema level. Larger files return
 *       400 from multer with "File too large".
 *
 *       **Not allowed on archived tasks** — returns 400.
 *
 *       **Cache flush:** `tasks:detail:{taskId}` +
 *       `tasks:list:{companyId}` + `tasks:intern:{internId}:{companyId}`.
 *     tags: [Dashboard - Tasks]
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
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 maxItems: 10
 *     responses:
 *       200:
 *         description: Attachments added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task: { $ref: '#/components/schemas/Task' }
 *       400: { description: No files, archived task, or file-type/size error }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Task not found at this company }
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
 *     summary: Remove an attachment from a single task
 *     description: |
 *       Removes one attachment by `public_id` (the attachmentId in
 *       the URL is the Cloudinary `public_id`). DB `$pull` runs
 *       FIRST, then best-effort Cloudinary destroy — failure to
 *       destroy is logged but does NOT roll back the DB write. The
 *       file becomes a janitorial concern (a future cleanup sweep
 *       can pick it up).
 *
 *       **Cache flush:** `tasks:detail:{taskId}` +
 *       `tasks:list:{companyId}` + `tasks:intern:{internId}` (note:
 *       this flushes WITHOUT the companyId suffix — looks like a bug
 *       that doesn't bite today but should be cleaned up).
 *     tags: [Dashboard - Tasks]
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
 *       - in: path
 *         name: attachmentId
 *         required: true
 *         schema: { type: string }
 *         description: Cloudinary public_id of the attachment
 *     responses:
 *       200: { description: Attachment removed }
 *       401: { description: Unauthenticated }
 *       403: { description: Not the company owner }
 *       404: { description: Task or attachment not found at this company }
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
 *     Task:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string, minLength: 2, maxLength: 200 }
 *         description: { type: string, minLength: 1, maxLength: 5000 }
 *         companyId: { type: string }
 *         internId: { type: string }
 *         projectId: { type: string, nullable: true }
 *         programId: { type: string, nullable: true }
 *         assignedBy: { type: string, description: Admin who created the task }
 *         taskGroupId:
 *           type: string
 *           nullable: true
 *           description: Set for all rows of a broadcast (shared across all members of the target group)
 *         status: { type: string, enum: [todo, in_progress, in_review, complete, archived] }
 *         priority: { type: string, enum: [high, medium, low] }
 *         tags:
 *           type: array
 *           items: { type: string, maxLength: 32 }
 *         dueDate: { type: string, format: date-time }
 *         attachments:
 *           type: array
 *           items: { $ref: '#/components/schemas/Attachment' }
 *         submittedAt: { type: string, format: date-time, nullable: true, description: 'Set when intern hits /submit' }
 *         reviewedAt: { type: string, format: date-time, nullable: true, description: 'Set when admin transitions to complete' }
 *         reviewerFeedback: { type: string, nullable: true }
 *         pointsAwarded: { type: integer, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     UpdateTask:
 *       type: object
 *       minProperties: 1
 *       description: 'Empty body rejected. `internId`, `attachments`, `status` are NOT in this schema.'
 *       properties:
 *         title: { type: string, minLength: 2, maxLength: 200 }
 *         description: { type: string, minLength: 1, maxLength: 5000 }
 *         priority: { type: string, enum: [high, medium, low] }
 *         tags:
 *           type: array
 *           items: { type: string, maxLength: 32 }
 *           maxItems: 20
 *         dueDate: { type: string, format: date-time }
 *         projectId: { type: string, description: 24-char ObjectId }
 *         programId: { type: string, description: 24-char ObjectId }
 *
 *     BroadcastMember:
 *       type: object
 *       description: One member of a broadcast — intern's per-row state hydrated with user info.
 *       properties:
 *         internId: { type: string }
 *         status: { type: string, enum: [todo, in_progress, in_review, complete] }
 *         submittedAt: { type: string, format: date-time, nullable: true }
 *         reviewedAt: { type: string, format: date-time, nullable: true }
 *         pointsAwarded: { type: integer, nullable: true }
 *         intern:
 *           type: object
 *           properties:
 *             firstName: { type: string }
 *             lastName: { type: string }
 *             email: { type: string, format: email }
 *             profilePicture:
 *               type: object
 *               nullable: true
 *
 *     BroadcastCard:
 *       type: object
 *       description: |
 *         Aggregated view of one taskGroupId. All N per-intern rows are
 *         collapsed into one card with member-level state counts.
 *       properties:
 *         taskGroupId: { type: string }
 *         title: { type: string }
 *         description: { type: string }
 *         priority: { type: string, enum: [high, medium, low] }
 *         dueDate: { type: string, format: date-time }
 *         projectId: { type: string, nullable: true }
 *         programId: { type: string, nullable: true }
 *         assignedBy: { type: string }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *         attachments:
 *           type: array
 *           items: { $ref: '#/components/schemas/Attachment' }
 *         totalMembers: { type: integer, description: 'Count of interns in this broadcast' }
 *         byStatus:
 *           type: object
 *           description: 'Per-status count across all members'
 *           properties:
 *             todo: { type: integer }
 *             in_progress: { type: integer }
 *             in_review: { type: integer }
 *             complete: { type: integer }
 *         members:
 *           type: array
 *           items: { $ref: '#/components/schemas/BroadcastMember' }
 *
 *     ListBroadcastsResponse:
 *       type: object
 *       properties:
 *         broadcasts:
 *           type: array
 *           items: { $ref: '#/components/schemas/BroadcastCard' }
 *         pagination: { $ref: '#/components/schemas/Pagination' }
 *
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
