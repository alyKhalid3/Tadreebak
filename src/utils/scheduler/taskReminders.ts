// Phase 2 — task reminder scheduler.
//
// Two periodic scans (driven by setInterval — no extra cron dep):
//   1. Every hour, find tasks with `dueDate` in the next 24h that
//      haven't been reminded yet → publish TASK_DUE_SOON. The
//      `dueSoonNotifiedAt` field is the idempotency key: we set it
//      after sending so a re-scan skips the same task.
//   2. Every hour, find tasks whose `dueDate` is in the past and that
//      are still open (status !== complete) → publish TASK_OVERDUE.
//      Same idempotency pattern with `overdueNotifiedAt`.
//
// Both scans are scoped to non-archived tasks. The intern's exact
// fire time is bucketed to the hour, so the second scan in the
// same hour will short-circuit on the first one.
//
// Why setInterval and not node-cron? The system has no other cron
// yet, the scans are cheap (indexed queries + indexed writes), and
// pulling in a new dep just for two timers is overkill. If we later
// need minute-level granularity or a job queue, we'll switch to
// node-cron + BullMQ.

import { TaskModel } from "../../DB/models/task.model"
import { TaskStatus } from "../../DB/types/task.type"
import { notificationEmitter } from "../notifications/notificationEvents"
import { NotificationType } from "../../DB/types/notification.type"

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS

let started = false
let intervalHandles: NodeJS.Timeout[] = []

// `runOnce` is exported so tests can trigger a scan synchronously
// instead of waiting for the timer to fire.
export const runDueSoonScan = async (now: Date = new Date()) => {
    const horizon = new Date(now.getTime() + ONE_DAY_MS)
    const tasks = await TaskModel.find(
        {
            status: { $nin: [TaskStatus.COMPLETE, TaskStatus.ARCHIVED] },
            dueDate: { $gte: now, $lte: horizon },
            dueSoonNotifiedAt: { $exists: false },
        },
        { _id: 1, title: 1, internId: 1, dueDate: 1 },
    ).lean()

    for (const t of tasks) {
        notificationEmitter.publish(NotificationType.TASK_DUE_SOON, {
            recipient: (t as any).internId.toString(),
            data: {
                taskId: (t as any)._id.toString(),
                taskTitle: t.title,
                dueDate: (t as any).dueDate,
            },
        })
    }
    if (tasks.length > 0) {
        // Mark them so the next scan skips them.
        await TaskModel.updateMany(
            { _id: { $in: tasks.map((t: any) => t._id) } },
            { $set: { dueSoonNotifiedAt: now } },
        )
    }
    return tasks.length
}

export const runOverdueScan = async (now: Date = new Date()) => {
    const tasks = await TaskModel.find(
        {
            status: { $nin: [TaskStatus.COMPLETE, TaskStatus.ARCHIVED] },
            dueDate: { $lt: now },
            overdueNotifiedAt: { $exists: false },
        },
        { _id: 1, title: 1, internId: 1, dueDate: 1 },
    ).lean()

    for (const t of tasks) {
        notificationEmitter.publish(NotificationType.TASK_OVERDUE, {
            recipient: (t as any).internId.toString(),
            data: {
                taskId: (t as any)._id.toString(),
                taskTitle: t.title,
                dueDate: (t as any).dueDate,
            },
        })
    }
    if (tasks.length > 0) {
        await TaskModel.updateMany(
            { _id: { $in: tasks.map((t: any) => t._id) } },
            { $set: { overdueNotifiedAt: now } },
        )
    }
    return tasks.length
}

// Wraps a scan in a try/catch so a transient DB error doesn't
// unhandle-reject the process. The next interval tick will retry.
const safeRun = (fn: () => Promise<number>, label: string) => async () => {
    try {
        const n = await fn()
        if (n > 0) console.log(`[taskReminders] ${label}: ${n} task(s)`)
    } catch (err) {
        console.error(`[taskReminders] ${label} failed:`, err)
    }
}

export const startTaskReminders = () => {
    if (started) return
    started = true

    // Run both scans hourly. The first invocation is delayed by 5s
    // so the rest of bootstrap has a chance to finish (DB connect,
    // routes mount, etc).
    const dueSoon = setInterval(safeRun(runDueSoonScan, "due-soon"), ONE_HOUR_MS)
    const overdue = setInterval(safeRun(runOverdueScan, "overdue"), ONE_HOUR_MS)
    // Also fire once after a short warm-up so a freshly-booted server
    // catches up on any tasks that crossed the threshold while it
    // was down.
    setTimeout(safeRun(runDueSoonScan, "due-soon (warm-up)"), 5_000)
    setTimeout(safeRun(runOverdueScan, "overdue (warm-up)"), 10_000)
    intervalHandles = [dueSoon, overdue]
    console.log("[taskReminders] scheduler started (hourly)")
}

export const stopTaskReminders = () => {
    for (const h of intervalHandles) clearInterval(h)
    intervalHandles = []
    started = false
}
