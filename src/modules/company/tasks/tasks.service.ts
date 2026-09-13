// Phase 2 + Phase 6: company-side task CRUD + state-machine transition
// + broadcast (4 modes of task creation).
//
// Broadcast modes (target: 'company' | 'program' | 'project' | 'intern'):
//   - company → fan out to every active intern at this company
//   - program → fan out to every intern in `program.internIds[]`
//   - project → fan out to every intern in `project.internIds[]`
//   - intern  → single recipient
// In every case the service resolves the target to a member list,
// generates one `taskGroupId`, and creates N task rows that share it.
// The admin kanban can then group the N rows under one card via
// `?taskGroupId=` or bulk-update them via PATCH /group/:groupId.
//
// Cache strategy:
//   - list/detail → 60s TTL under tasks:list:{companyId} / tasks:detail:{taskId}
//   - mutations (create, update, archive, transition, attachments) flush
//     the company's prefix + the task's detail key + each affected
//     intern's per-company cache prefix
//   - intern's own list/detail cached under tasks:intern:{internId}:{companyId}
//
// Notifications are published via notificationEmitter (not awaited
// here — the bus handles its own errors and won't block the response).

import { NextFunction, Request, Response } from "express"
import mongoose, { Types, isObjectIdOrHexString } from "mongoose"
import { TaskRepo } from "../../../DB/repos/task.repo"
import { ITask, TaskStatus, ITaskAttachment, TaskPriority } from "../../../DB/types/task.type"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import {
    cacheDel,
    cacheFlushPrefix,
    cacheWrap,
} from "../../../cache/cache"
import { UserModel } from "../../../DB/models/user.model"
import { ProgramModel } from "../../../DB/models/program.model"
import { ProjectModel } from "../../../DB/models/project.model"
import { EnrollmentStatus, IUser } from "../../../DB/types/user.type"
import { notificationEmitter } from "../../../utils/notifications/notificationEvents"
import { NotificationType } from "../../../DB/types/notification.type"
import {
    destroySingleFile,
    uploadSingleFile,
} from "../../../utils/multer/cloudinary.service"
import { ProjectRepo } from "../../../DB/repos/project.repo"
import { canTransition } from "../../../utils/taskStateMachine"
import { prioritySwitchBranches, priorityRank } from "../../../utils/taskPriority"
import { hasActiveEnrollmentAt } from "../../../utils/enrollment"

const taskRepo = new TaskRepo()
const projectRepo = new ProjectRepo()

// The priority sort uses the aggregation pipeline (see `buildListPipeline`
// below) so the DB returns a globally-correct order across pages —
// in-memory sorts would only reorder within a single page.

export class TasksService {
    // ---- Company: list tasks (kanban view) ----
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const {
                internId,
                projectId,
                programId,
                taskGroupId,
                status,
                priority,
                tag,
                search,
                sort,
                page,
                limit,
            } = req.query as {
                internId?: string
                projectId?: string
                programId?: string
                taskGroupId?: string
                status?: TaskStatus
                priority?: string
                tag?: string
                search?: string
                sort?: "recent" | "dueDate" | "priority" | "title"
                page?: number
                limit?: number
            }

            const filter: Record<string, any> = {
                companyId: new Types.ObjectId(companyId),
                // Hide archived by default; the kanban never wants them.
                status: { $ne: TaskStatus.ARCHIVED },
            }
            if (status) filter.status = status
            if (priority) filter.priority = priority
            if (internId) filter.internId = new Types.ObjectId(internId)
            if (projectId) filter.projectId = new Types.ObjectId(projectId)
            if (programId) filter.programId = new Types.ObjectId(programId)
            if (taskGroupId) filter.taskGroupId = new Types.ObjectId(taskGroupId)
            if (tag) filter.tags = tag
            if (search) filter.title = { $regex: search, $options: "i" }

            const pageNum = page ?? 1
            const limitNum = limit ?? 20
            const skip = (pageNum - 1) * limitNum

            // Sort: priority uses an aggregation pipeline so the DB
            // does a globally-correct sort across pages (the previous
            // in-memory sort only reordered within a single page —
            // meaning the same priority bucket would repeat on every
            // page). For other sorts, we still use a single-stage
            // aggregation to keep the items + totalCount in one round
            // trip via $facet.
            const sortStage =
                sort === "recent"
                    ? { createdAt: -1 as const }
                    : sort === "title"
                      ? { title: 1 as const }
                      : sort === "priority"
                        ? { priorityRank: 1 as const, dueDate: 1 as const }
                        : { dueDate: 1 as const }

            const cacheKey = `tasks:list:${companyId}:${JSON.stringify({ internId, projectId, programId, taskGroupId, status, priority, tag, search, sort, pageNum, limitNum })}`
            const { items, total } = await cacheWrap(cacheKey, 60, async () => {
                const TaskModel = (await import("../../../DB/models/task.model")).TaskModel
                const pipeline: any[] = [{ $match: filter }]

                // Add the priority rank only when we need it (saves a
                // tiny bit of work on every other sort).
                if (sort === "priority") {
                    pipeline.push({
                        $addFields: {
                            priorityRank: {
                                $switch: {
                                    branches: prioritySwitchBranches(),
                                    default: 9,
                                },
                            },
                        },
                    })
                }

                pipeline.push({
                    $facet: {
                        items: [{ $sort: sortStage }, { $skip: skip }, { $limit: limitNum }],
                        totalCount: [{ $count: "count" }],
                    },
                })

                const [result] = await TaskModel.aggregate(pipeline)
                const items = result?.items ?? []
                const total = result?.totalCount?.[0]?.count ?? 0
                return { items, total }
            })

            return successHandler({
                res,
                message: "Tasks fetched successfully",
                data: {
                    tasks: items,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        pages: Math.ceil(total / limitNum),
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: create task (broadcast) ----
    // Phase 6 — 4 target modes:
    //   - company → every active enrollment at this company
    //   - program → every intern in `program.internIds[]`
    //   - project → every intern in `project.internIds[]`
    //   - intern  → one recipient (`internId` required)
    //
    // In every case the service creates N task rows that share the
    // same `taskGroupId` so the admin kanban can group them and the
    // bulk-update endpoint can find them in one query. 0 members →
    // 400 (the admin asked for a broadcast with no recipients).
    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            // The middleware already discriminated the union; here
            // we narrow the body to its 4 possible shapes.
            const body = req.body as {
                target: "company" | "program" | "project" | "intern"
                title: string
                description: string
                priority?: TaskPriority
                tags?: string[]
                dueDate: Date
                attachments?: ITaskAttachment[]
                programId?: string
                projectId?: string
                internId?: string
            }

            // ---- 1. Resolve the target to a list of member internIds ----
            // Every mode intersects with "active at this company" so
            // we never assign a task to a stale member (e.g. someone
            // removed from the project but the doc wasn't cleaned up).
            let memberIds: Types.ObjectId[] = []
            let resolvedProjectId: string | undefined = body.projectId
            let resolvedProgramId: string | undefined = body.programId

            if (body.target === "company") {
                // Every user with an active enrollment at this company.
                // The index `enrollments.companyId + status` makes this fast.
                const users = await UserModel.find(
                    {
                        "enrollments.companyId": new Types.ObjectId(companyId),
                        "enrollments.status": EnrollmentStatus.ACTIVE,
                    },
                    { _id: 1 },
                ).lean()
                memberIds = users.map((u) => u._id as Types.ObjectId)
            } else if (body.target === "program") {
                // Narrow the body: the 'program' branch guarantees programId.
                const programId = body.programId as string
                const program = await ProgramModel.findOne(
                    { _id: programId, companyId },
                    { internIds: 1 },
                ).lean()
                if (!program) throw new NotFoundException("Program not found")
                const candidateIds = (program.internIds ?? []).map(
                    (id) => new Types.ObjectId(id.toString()),
                )
                memberIds = await this.filterActiveAtCompany(
                    candidateIds,
                    companyId,
                )
            } else if (body.target === "project") {
                // Narrow the body: the 'project' branch guarantees projectId.
                const projectId = body.projectId as string
                const project = await ProjectModel.findOne(
                    { _id: projectId, companyId },
                    { internIds: 1, programId: 1 },
                ).lean()
                if (!project) throw new NotFoundException("Project not found")
                const candidateIds = (project.internIds ?? []).map(
                    (id) => new Types.ObjectId(id.toString()),
                )
                memberIds = await this.filterActiveAtCompany(
                    candidateIds,
                    companyId,
                )
                // If the project is bound to a program, stamp it on every
                // task row so the task hierarchy stays consistent.
                if (project.programId && !resolvedProgramId) {
                    resolvedProgramId = project.programId.toString()
                }
            } else {
                // 'intern' — single recipient.
                const internId = body.internId as string
                const intern = await UserModel.findOne(
                    { _id: new Types.ObjectId(internId) },
                    { enrollments: 1, firstName: 1, lastName: 1 },
                ).lean()
                if (!intern) throw new NotFoundException("Intern not found")
                if (!hasActiveEnrollmentAt(intern, companyId)) {
                    throw new ApplicationError(
                        "This user is not an active intern at this company",
                        400,
                    )
                }
                memberIds = [new Types.ObjectId(internId)]
            }

            if (memberIds.length === 0) {
                throw new ApplicationError(
                    "No active members to assign this task to",
                    400,
                )
            }

            // ---- 2. Create the broadcast group + N task rows ----
            const taskGroupId = new Types.ObjectId()
            const now = new Date()
            const normalizedTags = (body.tags ?? []).map((t) => t.toLowerCase())

            const docs = memberIds.map((internId) => ({
                title: body.title,
                description: body.description,
                companyId: new Types.ObjectId(companyId),
                internId,
                assignedBy: new Types.ObjectId(user._id.toString()),
                status: TaskStatus.TODO,
                priority: body.priority ?? TaskPriority.MEDIUM,
                tags: normalizedTags,
                dueDate: new Date(body.dueDate),
                attachments: body.attachments ?? [],
                taskGroupId,
                ...(resolvedProjectId && {
                    projectId: new Types.ObjectId(resolvedProjectId),
                }),
                ...(resolvedProgramId && {
                    programId: new Types.ObjectId(resolvedProgramId),
                }),
            }))

            // insertMany is one round-trip; order is preserved.
            const tasks = await taskRepo.insertMany({ data: docs })

            // ---- 3. Bust caches ----
            await Promise.all([
                cacheFlushPrefix(`tasks:list:${companyId}`),
                cacheFlushPrefix(`tasks:group:${taskGroupId.toString()}`),
                ...memberIds.map((id) =>
                    cacheFlushPrefix(`tasks:intern:${id.toString()}:${companyId}`),
                ),
            ])

            // ---- 4. Notify each intern (one per row) ----
            for (const t of tasks) {
                notificationEmitter.publish(NotificationType.TASK_ASSIGNED, {
                    recipient: t.internId.toString(),
                    data: {
                        taskId: t._id?.toString(),
                        taskTitle: body.title,
                        dueDate: body.dueDate,
                        companyId,
                        taskGroupId: taskGroupId.toString(),
                    },
                })
            }

            // ---- 5. Response shape ----
            // Single recipient: `{ task: {...} }` for backward compat
            // with the original "create one task" wire format.
            // Multi-recipient: `{ tasks: [...], count, groupId, target, members }`.
            if (body.target === "intern") {
                return successHandler({
                    res,
                    message: "Task created successfully",
                    status: 201,
                    data: { task: tasks[0] },
                })
            }
            return successHandler({
                res,
                message: `Task broadcast to ${tasks.length} member(s) successfully`,
                status: 201,
                data: {
                    tasks,
                    count: tasks.length,
                    groupId: taskGroupId.toString(),
                    target: body.target,
                    members: tasks.length,
                },
            })
        } catch (error) {
            next(error)
        }
    }

    // Helper: given a candidate internId list, keep only those who
    // are still actively enrolled at the given company. Used by the
    // program/project broadcast modes to skip stale memberships.
    private filterActiveAtCompany = async (
        candidateIds: Types.ObjectId[],
        companyId: string,
    ): Promise<Types.ObjectId[]> => {
        if (candidateIds.length === 0) return []
        const users = await UserModel.find(
            { _id: { $in: candidateIds } },
            { enrollments: 1 },
        ).lean()
        const out: Types.ObjectId[] = []
        const cid = companyId.toString()
        for (const u of users) {
            const hasActive = (u.enrollments ?? []).some(
                (e) =>
                    e.companyId.toString() === cid &&
                    e.status === EnrollmentStatus.ACTIVE,
            )
            if (hasActive) out.push(u._id as Types.ObjectId)
        }
        return out
    }

    // ---- Company: list all rows in a broadcast (admin view) ----
    // Returns every task with the given taskGroupId at this company,
    // joined with the intern's name + email for the kanban preview.
    listByGroup = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const groupId = req.params.groupId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            if (!isObjectIdOrHexString(groupId)) {
                throw new ApplicationError("Invalid group id", 400)
            }

            const cacheKey = `tasks:group:${groupId}:${companyId}`
            const items = await cacheWrap(cacheKey, 30, async () => {
                const TaskModel = (await import("../../../DB/models/task.model")).TaskModel
                return TaskModel.find({
                    taskGroupId: new Types.ObjectId(groupId),
                    companyId: new Types.ObjectId(companyId),
                })
                    .populate("internId", "firstName lastName email")
                    .lean()
            })

            return successHandler({
                res,
                message: "Broadcast tasks fetched successfully",
                data: {
                    groupId,
                    count: items.length,
                    tasks: items,
                },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: bulk-update every task in a broadcast ----
    // The admin extends the due date / raises the priority for the
    // whole batch in one call. Status changes still go through
    // `/transition` (state machine), and `internId` / `projectId` /
    // `programId` / `attachments` are intentionally not in the
    // schema — broadcast identity is immutable after creation.
    bulkUpdateByGroup = async (
        req: Request,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const companyId = req.params.companyId as string
            const groupId = req.params.groupId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            if (!isObjectIdOrHexString(groupId)) {
                throw new ApplicationError("Invalid group id", 400)
            }

            const update = req.body as Record<string, any>
            if (Array.isArray(update.tags)) {
                update.tags = update.tags.map((t: string) => t.toLowerCase())
            }
            if (update.dueDate) update.dueDate = new Date(update.dueDate)

            const result = await taskRepo.updateMany({
                filter: {
                    taskGroupId: new Types.ObjectId(groupId),
                    companyId: new Types.ObjectId(companyId),
                },
                data: update,
            })

            // The DBRepo return type is a union; only the UpdateWriteOpResult
            // branch has matchedCount/modifiedCount. Narrow with a cast —
            // updateMany always returns that shape in practice.
            const r = result as { matchedCount?: number; modifiedCount?: number } | null
            if (!r || (r.matchedCount ?? 0) === 0) {
                throw new NotFoundException("Broadcast not found")
            }

            await Promise.all([
                cacheFlushPrefix(`tasks:list:${companyId}`),
                cacheFlushPrefix(`tasks:group:${groupId}`),
            ])

            return successHandler({
                res,
                message: "Broadcast updated successfully",
                data: {
                    groupId,
                    matched: r.matchedCount ?? 0,
                    modified: r.modifiedCount ?? 0,
                },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: task detail ----
    detail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const cacheKey = `tasks:detail:${taskId}`
            const task = await cacheWrap(cacheKey, 60, async () => {
                return taskRepo.findOne({ filter: { _id: taskId, companyId } })
            })
            if (!task) throw new NotFoundException("Task not found")

            return successHandler({
                res,
                message: "Task fetched successfully",
                data: { task },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: update task (full edit) ----
    update = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const existing = await taskRepo.findOne({ filter: { _id: taskId, companyId } })
            if (!existing) throw new NotFoundException("Task not found")

            // Don't let an admin change internId via the generic update
            // — that's a different operation (re-assignment) and would
            // orphan the existing notification/audit trail.
            const updateData: Record<string, any> = { ...req.body }
            delete updateData.internId
            delete updateData.attachments
            delete updateData.status // use /transition for status changes
            // Normalize tags the same way create does.
            if (Array.isArray(updateData.tags)) {
                updateData.tags = updateData.tags.map((t: string) => t.toLowerCase())
            }

            const updated = await taskRepo.update({
                filter: { _id: taskId, companyId },
                data: updateData,
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`tasks:detail:${taskId}`),
                cacheFlushPrefix(`tasks:list:${companyId}`),
                cacheFlushPrefix(
                    `tasks:intern:${(existing as any).internId.toString()}:${companyId}`,
                ),
            ])

            return successHandler({
                res,
                message: "Task updated successfully",
                data: { task: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: archive task (soft delete) ----
    archive = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const existing = await taskRepo.findOne({ filter: { _id: taskId, companyId } })
            if (!existing) throw new NotFoundException("Task not found")

            await taskRepo.update({
                filter: { _id: taskId, companyId },
                data: { status: TaskStatus.ARCHIVED },
            })

            await Promise.all([
                cacheDel(`tasks:detail:${taskId}`),
                cacheFlushPrefix(`tasks:list:${companyId}`),
                cacheFlushPrefix(
                    `tasks:intern:${(existing as any).internId.toString()}:${companyId}`,
                ),
            ])

            return successHandler({ res, message: "Task archived successfully" })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: state-machine transition ----
    // Emits notifications and, on completion, awards points (Phase 5
    // will read the actual rules; for now the admin can pass an explicit
    // `pointsAwarded` in the body).
    transition = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const { to, reviewerFeedback, pointsAwarded } = req.body as {
                to: TaskStatus
                reviewerFeedback?: string
                pointsAwarded?: number
            }

            const task: any = await taskRepo.findOne({
                filter: { _id: taskId, companyId },
            })
            if (!task) throw new NotFoundException("Task not found")
            if (task.status === TaskStatus.ARCHIVED) {
                throw new ApplicationError("Cannot transition an archived task", 400)
            }
            if (!canTransition('admin', task.status as TaskStatus, to)) {
                throw new ApplicationError(
                    `Cannot transition from "${task.status}" to "${to}"`,
                    400,
                )
            }

            const now = new Date()
            const update: Record<string, any> = { status: to }
            if (to === TaskStatus.COMPLETE) {
                update.reviewedAt = now
                if (reviewerFeedback !== undefined) update.reviewerFeedback = reviewerFeedback
                if (pointsAwarded !== undefined) update.pointsAwarded = pointsAwarded
            } else if (to === TaskStatus.IN_REVIEW) {
                // Intern-side endpoint sets submittedAt; this branch is
                // only hit when admin does a "force move back" from
                // review, so we don't touch submittedAt.
            } else if (to === TaskStatus.IN_PROGRESS) {
                // When admin sends a task back, clear the submit
                // timestamp so the next submit is a fresh one.
                update.submittedAt = null
            }

            const updated = await taskRepo.update({
                filter: { _id: taskId, companyId },
                data: update,
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`tasks:detail:${taskId}`),
                cacheFlushPrefix(`tasks:list:${companyId}`),
                cacheFlushPrefix(`tasks:intern:${task.internId.toString()}:${companyId}`),
            ])

            // Notify the intern. On approve-vs-reject we use TASK_REVIEWED
            // with `approved` so the message reads naturally.
            if (to === TaskStatus.COMPLETE) {
                notificationEmitter.publish(NotificationType.TASK_REVIEWED, {
                    recipient: task.internId.toString(),
                    data: {
                        taskId: taskId as string,
                        taskTitle: task.title,
                        approved: true,
                        pointsAwarded: pointsAwarded,
                        feedback: reviewerFeedback,
                    },
                })
            } else if (to === TaskStatus.IN_PROGRESS) {
                // admin sent it back
                notificationEmitter.publish(NotificationType.TASK_REVIEWED, {
                    recipient: task.internId.toString(),
                    data: {
                        taskId: taskId as string,
                        taskTitle: task.title,
                        approved: false,
                        feedback: reviewerFeedback,
                    },
                })
            }

            return successHandler({
                res,
                message: "Task transitioned successfully",
                data: { task: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: reviewer feedback (separate from transition) ----
    // Used when the admin wants to leave a comment without changing status.
    feedback = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const { reviewerFeedback } = req.body as { reviewerFeedback: string }
            const task = await taskRepo.findOne({ filter: { _id: taskId, companyId } })
            if (!task) throw new NotFoundException("Task not found")

            const updated = await taskRepo.update({
                filter: { _id: taskId, companyId },
                data: { reviewerFeedback },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`tasks:detail:${taskId}`),
                cacheFlushPrefix(`tasks:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Feedback saved",
                data: { task: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: add attachments to an existing task ----
    // Used for follow-up files. The intern can also call this.
    addAttachments = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const files = (req.files as Express.Multer.File[] | undefined) ?? []
            if (files.length === 0) {
                throw new ApplicationError("No files uploaded", 400)
            }
            const task: any = await taskRepo.findOne({ filter: { _id: taskId, companyId } })
            if (!task) throw new NotFoundException("Task not found")
            if (task.status === TaskStatus.ARCHIVED) {
                throw new ApplicationError("Cannot add attachments to an archived task", 400)
            }

            // Upload to Cloudinary one at a time. We tolerate per-file
            // failure by continuing on the rest, but at the end we
            // either commit all of them or report which one failed.
            const newAttachments: ITaskAttachment[] = []
            try {
                for (const f of files) {
                    const uploaded = await uploadSingleFile({
                        path: f.path,
                        folder: `companies/${companyId}/tasks/${taskId}`,
                        resourceType: f.mimetype.startsWith("image/") ? "image" : "raw",
                    })
                    newAttachments.push({
                        public_id: uploaded.public_id,
                        secure_url: uploaded.secure_url,
                        name: f.originalname,
                        mimeType: f.mimetype,
                        size: f.size,
                    })
                }
            } catch (uploadErr) {
                // Best-effort cleanup of any partial uploads.
                for (const a of newAttachments) {
                    try {
                        await destroySingleFile(
                            a.public_id,
                            a.mimeType.startsWith("image/") ? "image" : "raw",
                        )
                    } catch {
                        // ignore cleanup errors
                    }
                }
                throw uploadErr
            }

            const updated = await taskRepo.update({
                filter: { _id: taskId, companyId },
                data: { $push: { attachments: { $each: newAttachments } } },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`tasks:detail:${taskId}`),
                cacheFlushPrefix(`tasks:list:${companyId}`),
                cacheFlushPrefix(`tasks:intern:${task.internId.toString()}:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Attachments added",
                data: { task: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: remove one attachment ----
    removeAttachment = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string
            const attachmentId = req.params.attachmentId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const task: any = await taskRepo.findOne({ filter: { _id: taskId, companyId } })
            if (!task) throw new NotFoundException("Task not found")
            const att = (task.attachments ?? []).find(
                (a: ITaskAttachment) => a.public_id === attachmentId,
            )
            if (!att) throw new NotFoundException("Attachment not found")

            await taskRepo.update({
                filter: { _id: taskId, companyId },
                data: { $pull: { attachments: { public_id: attachmentId } } },
            })

            // Best-effort Cloudinary delete — we don't roll back the
            // DB write if the destroy call fails, because the file is
            // no longer reachable from the task and the next cleanup
            // sweep can pick it up.
            try {
                await destroySingleFile(
                    att.public_id,
                    att.mimeType.startsWith("image/") ? "image" : "raw",
                )
            } catch (err) {
                console.error("Failed to delete attachment from Cloudinary:", err)
            }

            await Promise.all([
                cacheDel(`tasks:detail:${taskId}`),
                cacheFlushPrefix(`tasks:list:${companyId}`),
                cacheFlushPrefix(`tasks:intern:${task.internId.toString()}`),
            ])

            return successHandler({ res, message: "Attachment removed" })
        } catch (error) {
            next(error)
        }
    }
}
