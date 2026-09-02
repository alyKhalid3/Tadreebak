// Phase 2 — intern-side task endpoints. The intern can:
//   - list their own tasks (filtered by status)
//   - fetch their own task detail
//   - start a task (todo → in_progress)
//   - submit a task (in_progress → in_review) with an optional note
//
// All endpoints are scoped to the authenticated user — they cannot
// touch another intern's tasks. The state machine matches the
// company-side ALLOWED_TRANSITIONS table.
//
// Notifications: on submit, the company owner gets a TASK_SUBMITTED.

import { NextFunction, Request, Response } from "express"
import mongoose, { Types, isObjectIdOrHexString } from "mongoose"
import { TaskRepo } from "../../../DB/repos/task.repo"
import { TaskStatus, ITask } from "../../../DB/types/task.type"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import {
    cacheDel,
    cacheFlushPrefix,
    cacheWrap,
} from "../../../cache/cache"
import { notificationEmitter } from "../../../utils/notifications/notificationEvents"
import { NotificationType } from "../../../DB/types/notification.type"

const taskRepo = new TaskRepo()

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW],
    [TaskStatus.IN_REVIEW]: [TaskStatus.IN_PROGRESS],
    [TaskStatus.COMPLETE]: [],
    [TaskStatus.ARCHIVED]: [],
}

const isAllowedTransition = (from: TaskStatus, to: TaskStatus): boolean =>
    ALLOWED_TRANSITIONS[from]?.includes(to) ?? false

export class InternTasksService {
    // ---- Intern: list my tasks ----
    listMine = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const internId = user._id.toString()
            const { status, page = 1, limit = 20, sort = "dueDate" } = req.query as {
                status?: TaskStatus
                page?: number
                limit?: number
                sort?: "recent" | "dueDate" | "priority" | "title"
            }

            const filter: Record<string, any> = {
                internId: new Types.ObjectId(internId),
                status: { $ne: TaskStatus.ARCHIVED },
            }
            if (status) filter.status = status

            const pageNum = page ?? 1
            const limitNum = limit ?? 20
            const skip = (pageNum - 1) * limitNum
            const sortKey: Record<string, 1 | -1> =
                sort === "recent"
                    ? { createdAt: -1 }
                    : sort === "title"
                      ? { title: 1 }
                      : { dueDate: 1 }

            const cacheKey = `tasks:intern:${internId}:${JSON.stringify({ status, sort, pageNum, limitNum })}`
            const { items, total } = await cacheWrap(cacheKey, 30, async () => {
                const [rows, totalCount] = await Promise.all([
                    taskRepo.find({
                        filter,
                        options: { skip, limit: limitNum, sort: sortKey },
                    }),
                    (await import("../../../DB/models/task.model")).TaskModel.countDocuments(filter),
                ])
                return { items: rows, total: totalCount }
            })

            return successHandler({
                res,
                message: "My tasks fetched successfully",
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

    // ---- Intern: my task detail ----
    detail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const internId = user._id.toString()
            const taskId = req.params.taskId as string

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const cacheKey = `tasks:intern:detail:${taskId}`
            const task: any = await cacheWrap(cacheKey, 30, async () => {
                return taskRepo.findOne({ filter: { _id: taskId, internId: new Types.ObjectId(internId) } })
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

    // ---- Intern: start (todo → in_progress) ----
    start = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const internId = user._id.toString()
            const taskId = req.params.taskId as string

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const task: any = await taskRepo.findOne({ filter: { _id: taskId, internId: new Types.ObjectId(internId) } })
            if (!task) throw new NotFoundException("Task not found")
            if (!isAllowedTransition(task.status as TaskStatus, TaskStatus.IN_PROGRESS)) {
                throw new ApplicationError(
                    `Cannot start a task in status "${task.status}"`,
                    400,
                )
            }

            const updated = await taskRepo.update({
                filter: { _id: taskId, internId: new Types.ObjectId(internId) },
                data: { status: TaskStatus.IN_PROGRESS },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`tasks:intern:detail:${taskId}`),
                cacheFlushPrefix(`tasks:intern:${internId}`),
                cacheFlushPrefix(`tasks:list:${task.companyId.toString()}`),
            ])

            return successHandler({
                res,
                message: "Task started",
                data: { task: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Intern: submit (in_progress → in_review) ----
    submit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const internId = user._id.toString()
            const taskId = req.params.taskId as string

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            const { note } = (req.body ?? {}) as { note?: string }

            const task: any = await taskRepo.findOne({ filter: { _id: taskId, internId: new Types.ObjectId(internId) } })
            if (!task) throw new NotFoundException("Task not found")
            if (!isAllowedTransition(task.status as TaskStatus, TaskStatus.IN_REVIEW)) {
                throw new ApplicationError(
                    `Cannot submit a task in status "${task.status}"`,
                    400,
                )
            }

            const now = new Date()
            const update: Record<string, any> = {
                status: TaskStatus.IN_REVIEW,
                submittedAt: now,
            }
            if (note) {
                // Append the intern's note to the existing feedback so
                // the admin sees the full thread. Don't overwrite a
                // prior admin feedback.
                const existing = task.reviewerFeedback as string | undefined
                update.reviewerFeedback = existing
                    ? `${existing}\n\n[intern note ${now.toISOString()}]\n${note}`
                    : `[intern note ${now.toISOString()}]\n${note}`
            }

            const updated = await taskRepo.update({
                filter: { _id: taskId, internId: new Types.ObjectId(internId) },
                data: update,
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`tasks:intern:detail:${taskId}`),
                cacheFlushPrefix(`tasks:intern:${internId}`),
                cacheFlushPrefix(`tasks:list:${task.companyId.toString()}`),
            ])

            // Notify the company owner that the intern is ready for review.
            notificationEmitter.publish(NotificationType.TASK_SUBMITTED, {
                recipient: task.assignedBy.toString(),
                data: {
                    taskId: taskId as string,
                    taskTitle: task.title,
                    internName: `${user.firstName} ${user.lastName}`,
                    companyId: task.companyId.toString(),
                },
            })

            return successHandler({
                res,
                message: "Task submitted for review",
                data: { task: updated },
            })
        } catch (error) {
            next(error)
        }
    }
}
