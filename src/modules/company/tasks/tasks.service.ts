// Phase 2 of the dashboard plan: company-side task CRUD + the
// state-machine transition endpoint that emits notifications and
// awards points on completion.
//
// Cache strategy (Phase 1 pattern):
//   - list/detail → 60s TTL under tasks:list:{companyId} / tasks:detail:{taskId}
//   - mutations (create, update, archive, transition, attachments) flush
//     the company's prefix + the task's detail key
//   - intern's own list/detail cached under tasks:intern:{internId}
//
// Notifications are published via notificationEmitter (not awaited
// here — the bus handles its own errors and won't block the response).

import { NextFunction, Request, Response } from "express"
import mongoose, { Types, isObjectIdOrHexString } from "mongoose"
import { TaskRepo } from "../../../DB/repos/task.repo"
import { ITask, TaskStatus, ITaskAttachment } from "../../../DB/types/task.type"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import {
    cacheDel,
    cacheFlushPrefix,
    cacheWrap,
} from "../../../cache/cache"
import { UserModel } from "../../../DB/models/user.model"
import { notificationEmitter } from "../../../utils/notifications/notificationEvents"
import { NotificationType } from "../../../DB/types/notification.type"
import {
    destroySingleFile,
    uploadSingleFile,
} from "../../../utils/multer/cloudinary.service"
import { ProjectRepo } from "../../../DB/repos/project.repo"

const taskRepo = new TaskRepo()
const projectRepo = new ProjectRepo()

// Allowed status transitions. Used by both the company's transition
// endpoint and the intern's start/submit endpoints. Soft-delete
// (`archived`) is a separate endpoint, not a transition.
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.COMPLETE],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW, TaskStatus.COMPLETE],
    [TaskStatus.IN_REVIEW]: [
        TaskStatus.IN_PROGRESS, // admin sends back for more work
        TaskStatus.COMPLETE,
    ],
    [TaskStatus.COMPLETE]: [], // terminal until archived
    [TaskStatus.ARCHIVED]: [], // terminal
}

const isAllowedTransition = (from: TaskStatus, to: TaskStatus): boolean =>
    ALLOWED_TRANSITIONS[from]?.includes(to) ?? false

// The priority sort is hand-rolled (high > medium > low) because
// string-sorting the enum would put 'high' after 'low' alphabetically.
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

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
            if (tag) filter.tags = tag
            if (search) filter.title = { $regex: search, $options: "i" }

            const pageNum = page ?? 1
            const limitNum = limit ?? 20
            const skip = (pageNum - 1) * limitNum

            // Sort: priority is hand-rolled; everything else maps to a
            // mongo sort key. Default `dueDate` is the kanban default —
            // soonest first, so the most urgent work floats to the top.
            const sortKey: Record<string, 1 | -1> =
                sort === "recent"
                    ? { createdAt: -1 }
                    : sort === "title"
                      ? { title: 1 }
                      : { dueDate: 1 }

            const cacheKey = `tasks:list:${companyId}:${JSON.stringify({ internId, projectId, programId, status, priority, tag, search, sort, pageNum, limitNum })}`
            const { items, total } = await cacheWrap(cacheKey, 60, async () => {
                const [rows, totalCount] = await Promise.all([
                    taskRepo.find({
                        filter,
                        options: { skip, limit: limitNum },
                    }),
                    (await import("../../../DB/models/task.model")).TaskModel.countDocuments(filter),
                ])
                // priority is hand-sorted in-memory (small page, < 100 docs)
                if (sort === "priority") {
                    rows.sort(
                        (a: any, b: any) =>
                            (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
                    )
                }
                return { items: rows, total: totalCount }
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

    // ---- Company: create task ----
    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const data = req.body as {
                title: string
                description: string
                internId: string
                projectId?: string
                programId?: string
                priority?: string
                tags?: string[]
                dueDate: Date
                // Already-uploaded attachments (controller uploaded them
                // to Cloudinary before this service ran).
                attachments?: ITaskAttachment[]
            }

            // Intern must be enrolled at this company. We do a single
            // projection read so the 404 message can include the name.
            const intern = await UserModel.findOne(
                { _id: new Types.ObjectId(data.internId) },
                { firstName: 1, lastName: 1, enrollmentCompanyId: 1, role: 1 },
            ).lean()
            if (!intern) throw new NotFoundException("Intern not found")
            if (
                !intern.enrollmentCompanyId ||
                intern.enrollmentCompanyId.toString() !== companyId
            ) {
                throw new ApplicationError(
                    "This user is not an intern at this company",
                    400,
                )
            }

            // Optional project/program sanity-check. A wrong id here
            // would silently leave the reference dangling in the task
            // doc — fail fast instead.
            if (data.projectId) {
                const project = await projectRepo.findOne({
                    filter: { _id: data.projectId, companyId },
                })
                if (!project) throw new NotFoundException("Project not found")
            }

            // Build the insert object without setting `undefined` on
            // optional fields — exactOptionalPropertyTypes would reject
            // them. Conditional spread skips them.
            const task = await taskRepo.create({
                data: {
                    title: data.title,
                    description: data.description,
                    companyId: new Types.ObjectId(companyId),
                    internId: new Types.ObjectId(data.internId),
                    assignedBy: new Types.ObjectId(user._id.toString()),
                    status: TaskStatus.TODO,
                    priority: (data.priority as any) ?? "medium",
                    tags: (data.tags ?? []).map((t) => t.toLowerCase()),
                    dueDate: new Date(data.dueDate),
                    attachments: data.attachments ?? [],
                    ...(data.projectId && {
                        projectId: new Types.ObjectId(data.projectId),
                    }),
                    ...(data.programId && {
                        programId: new Types.ObjectId(data.programId),
                    }),
                },
            })

            await cacheFlushPrefix(`tasks:list:${companyId}`)
            await cacheFlushPrefix(`tasks:intern:${data.internId}`)

            // Notify the intern they've been assigned a new task.
            notificationEmitter.publish(NotificationType.TASK_ASSIGNED, {
                recipient: data.internId,
                data: {
                    taskId: (task as any)._id.toString(),
                    taskTitle: data.title,
                    dueDate: data.dueDate,
                    companyId,
                },
            })

            return successHandler({
                res,
                message: "Task created successfully",
                status: 201,
                data: { task },
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
                cacheFlushPrefix(`tasks:intern:${(existing as any).internId.toString()}`),
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
                cacheFlushPrefix(`tasks:intern:${(existing as any).internId.toString()}`),
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
            if (!isAllowedTransition(task.status as TaskStatus, to)) {
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
                cacheFlushPrefix(`tasks:intern:${task.internId.toString()}`),
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
                cacheFlushPrefix(`tasks:intern:${task.internId.toString()}`),
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
