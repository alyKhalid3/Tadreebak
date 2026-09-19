import { Types } from "mongoose"

/**
 * Lifecycle of an internship invite. Today the admin fires the
 * invite (status starts at `pending`); the student still applies
 * through the normal `POST /applications` path. We keep the
 * status enum so a future student-side accept / decline flow can
 * be wired without a schema migration.
 */
export enum InternshipInviteStatus {
    PENDING = 'pending',
    ACCEPTED = 'accepted',
    DECLINED = 'declined',
    REVOKED = 'revoked',
}

export interface IInternshipInvite {
    companyId: Types.ObjectId
    internshipId: Types.ObjectId
    studentId: Types.ObjectId
    invitedBy: Types.ObjectId
    status: InternshipInviteStatus
    note?: string
    createdAt?: Date
    updatedAt?: Date
}
