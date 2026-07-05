import { Types } from "mongoose";



export enum NotificationType {
    APPLICATION_SUBMITTED = 'application_submitted',
    // accepted or rejected — the outcome is carried in `data.status`
    APPLICATION_REVIEWED = 'application_reviewed',
    APPLICATION_CANCELLED = 'application_cancelled',
    COMPANY_APPROVED = 'company_approved',
    COMPANY_BANNED = 'company_banned',
    COMPANY_UNBANNED = 'company_unbanned',
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
