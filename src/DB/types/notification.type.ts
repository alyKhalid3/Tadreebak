import { Types } from "mongoose";



export enum NotificationType {
    APPLICATION_SUBMITTED = 'application_submitted',
    // accepted or rejected — the outcome is carried in `data.status`
    APPLICATION_REVIEWED = 'application_reviewed',
    APPLICATION_CANCELLED = 'application_cancelled',
    COMPANY_APPROVED = 'company_approved',
    COMPANY_BANNED = 'company_banned',
    COMPANY_UNBANNED = 'company_unbanned',
    RATING_RECEIVED = 'rating_received',
    INTERN_MATCH_POSTED = 'intern_match_posted',
    // Phase 2 — Task lifecycle events.
    TASK_ASSIGNED = 'task_assigned',
    TASK_SUBMITTED = 'task_submitted',     // intern moved to in_review
    TASK_REVIEWED = 'task_reviewed',       // admin moved to complete
    TASK_DUE_SOON = 'task_due_soon',       // cron: dueDate - 24h
    TASK_OVERDUE = 'task_overdue',         // cron: dueDate passed, still open
    // Phase 4 — Evaluation lifecycle.
    EVALUATION_CREATED = 'evaluation_created', // admin submitted a new review
    EVALUATION_SHARED = 'evaluation_shared',   // admin flipped sharedWithIntern to true
}

export interface INotification {
    recipient: Types.ObjectId;
    type: NotificationType;
    title: string;
    message: string;
    // Context for deep-linking on the client, e.g.
    // { internshipId, applicationId, status, companyName }
    data?: Record<string, any>;
    read: boolean;
}
