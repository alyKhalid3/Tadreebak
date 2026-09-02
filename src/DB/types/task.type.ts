// Task = a unit of work the company assigns to an active intern. The
// kanban view groups by status; the intern profile shows the full
// history. Phase 2 of the dashboard plan.
//
// State machine (transitions enforced in service):
//   todo       → in_progress  (intern starts)  | complete (admin shortcut)
//   in_progress → in_review   (intern submits)
//   in_review  → in_progress  (admin rejects back)
//   in_review  → complete     (admin approves)
//   any         → archived    (soft delete)
//
// Points (Phase 5) are awarded when a task moves to `complete`. The
// award amount is captured at the time of completion so retroactive
// rule changes don't change history.

import { Types } from "mongoose"

export enum TaskStatus {
    TODO = 'todo',
    IN_PROGRESS = 'in_progress',
    IN_REVIEW = 'in_review',
    COMPLETE = 'complete',
    // Soft-deleted tasks are kept in the DB for the audit history.
    // The kanban view filters them out.
    ARCHIVED = 'archived',
}

export enum TaskPriority {
    HIGH = 'high',
    MEDIUM = 'medium',
    LOW = 'low',
}

export interface ITaskAttachment {
    public_id: string
    secure_url: string
    name: string
    mimeType: string
    size: number
}

export interface ITask {
    _id?: Types.ObjectId
    title: string
    description: string
    companyId: Types.ObjectId
    internId: Types.ObjectId
    projectId?: Types.ObjectId
    programId?: Types.ObjectId
    assignedBy: Types.ObjectId
    status: TaskStatus
    priority: TaskPriority
    tags: string[]
    dueDate: Date
    attachments: ITaskAttachment[]
    // Set when intern moves to in_review via POST /intern/me/tasks/:id/submit
    submittedAt?: Date
    // Set when admin moves to complete via POST /company/:id/tasks/:id/transition
    reviewedAt?: Date
    reviewerFeedback?: string
    // Set when reviewed → complete if a PointRule matched. Phase 5 wires
    // the rules engine; for now the field is a freeform number set by the
    // admin's transition call.
    pointsAwarded?: number
    // Has the intern seen the "due in 24h" reminder? Prevents spamming
    // them every hour. The cron job sets this to true after sending.
    dueSoonNotifiedAt?: Date
    // Set when the cron marks the task overdue. Used to gate the red
    // badge and the daily overdue email so they fire only once per day.
    overdueNotifiedAt?: Date
    createdAt?: Date
    updatedAt?: Date
}
