// Phase 5 — intern-side task endpoints, scoped to a single company.
//
// The intern can:
//   - list their own tasks at THIS company (filtered by status)
//   - fetch their own task detail at THIS company
//   - start a task (todo → in_progress)
//   - submit a task (in_progress → in_review) with an optional note
//
// All endpoints are scoped to the (user, company) pair:
//   - requireIntern middleware confirms the user is an intern at all
//   - the service re-checks hasActiveEnrollmentAt(user, companyId)
//     to confirm they are an intern AT THIS company
//   - every query filters by both internId AND companyId
//
// The state machine matches the company-side ALLOWED_TRANSITIONS
// table (see src/utils/taskStateMachine.ts).
//
// Notifications: on submit, the company owner at that company gets
// a TASK_SUBMITTED. On task creation the same company owner gets
// TASK_ASSIGNED — the task lives at the company it's assigned to,
// so there's no cross-company fan-out.
//
// Cache strategy (Phase 5):
//   - list   → 30s, keyed  tasks:intern:{internId}:{companyId}:{query hash}
//   - detail → 30s, keyed  tasks:intern:detail:{taskId}
//   - mutations flush  tasks:intern:{internId}:{companyId} +
//                      tasks:list:{companyId} + tasks:intern:detail:{taskId}

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
import { canTransition } from "../../../utils/taskStateMachine"
import { hasActiveEnrollmentAt } from "../../../utils/enrollment"

const taskRepo = new TaskRepo()

export class InternTasksService {
    // ---- Intern: list my tasks at THIS company ----
    listMine = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const internId = user._id.toString()
            const companyId = req.params.companyId as string

            // Defense in depth: the URL has :companyId, but we still
            // re-check that the user is an active intern here.
            if (!hasActiveEnrollmentAt(user, companyId)) {
                throw new NotFoundException(
                    "You are not enrolled at this company",
                )
            }

            const { status, page = 1, limit = 20, sort = "dueDate" } = req.query as {
                status?: TaskStatus
                page?: number
                limit?: number
                sort?: "recent" | "dueDate" | "priority" | "title"
            }

            const filter: Record<string, any> = {
                internId: new Types.ObjectId(internId),
                // Phase 5: every per-company view scopes by companyId too.
                companyId: new Types.ObjectId(companyId),
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

            // Per-company cache key.
            const cacheKey = `tasks:intern:${internId}:${companyId}:${JSON.stringify({ status, sort, pageNum, limitNum })}`
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

    // ---- Intern: my task detail at THIS company ----
    detail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const internId = user._id.toString()
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            if (!hasActiveEnrollmentAt(user, companyId)) {
                throw new NotFoundException(
                    "You are not enrolled at this company",
                )
            }
            const cacheKey = `tasks:intern:detail:${taskId}`
            const task: any = await cacheWrap(cacheKey, 30, async () => {
                // Scope by both internId AND companyId so a task at
                // another company cannot leak via id guessing.
                return taskRepo.findOne({
                    filter: {
                        _id: taskId,
                        internId: new Types.ObjectId(internId),
                        companyId: new Types.ObjectId(companyId),
                    },
                })
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
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            if (!hasActiveEnrollmentAt(user, companyId)) {
                throw new NotFoundException(
                    "You are not enrolled at this company",
                )
            }
            const task: any = await taskRepo.findOne({
                filter: {
                    _id: taskId,
                    internId: new Types.ObjectId(internId),
                    companyId: new Types.ObjectId(companyId),
                },
            })
            if (!task) throw new NotFoundException("Task not found")
            if (!canTransition("intern", task.status as TaskStatus, TaskStatus.IN_PROGRESS)) {
                throw new ApplicationError(
                    `Cannot start a task in status "${task.status}"`,
                    400,
                )
            }

            const updated = await taskRepo.update({
                filter: {
                    _id: taskId,
                    internId: new Types.ObjectId(internId),
                    companyId: new Types.ObjectId(companyId),
                },
                data: { status: TaskStatus.IN_PROGRESS },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`tasks:intern:detail:${taskId}`),
                // Per-company cache key (Phase 5).
                cacheFlushPrefix(`tasks:intern:${internId}:${companyId}`),
                cacheFlushPrefix(`tasks:list:${companyId}`),
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
            const companyId = req.params.companyId as string
            const taskId = req.params.taskId as string

            if (!isObjectIdOrHexString(taskId)) {
                throw new ApplicationError("Invalid task id", 400)
            }
            if (!hasActiveEnrollmentAt(user, companyId)) {
                throw new NotFoundException(
                    "You are not enrolled at this company",
                )
            }
            const { note } = (req.body ?? {}) as { note?: string }

            const task: any = await taskRepo.findOne({
                filter: {
                    _id: taskId,
                    internId: new Types.ObjectId(internId),
                    companyId: new Types.ObjectId(companyId),
                },
            })
            if (!task) throw new NotFoundException("Task not found")
            if (!canTransition("intern", task.status as TaskStatus, TaskStatus.IN_REVIEW)) {
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
                filter: {
                    _id: taskId,
                    internId: new Types.ObjectId(internId),
                    companyId: new Types.ObjectId(companyId),
                },
                data: update,
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`tasks:intern:detail:${taskId}`),
                cacheFlushPrefix(`tasks:intern:${internId}:${companyId}`),
                cacheFlushPrefix(`tasks:list:${companyId}`),
            ])

            // Notify the company owner at THIS company that the
            // intern is ready for review.
            notificationEmitter.publish(NotificationType.TASK_SUBMITTED, {
                recipient: task.assignedBy.toString(),
                data: {
                    taskId: taskId as string,
                    taskTitle: task.title,
                    internName: `${user.firstName} ${user.lastName}`,
                    companyId,
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
