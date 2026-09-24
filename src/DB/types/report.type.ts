import { Types } from "mongoose"

/**
 * Phase 16 / P3 #8 — Content reports.
 *
 * Three target types match the BACKEND_GAPS_EN §8 wire contract.
 * Stored as strings (not ObjectId-typed) so the same `targetId`
 * can reference a Company / User / InternShip without a
 * discriminated union at the schema layer; the admin-side
 * viewer (future) will resolve the type at read time.
 */
export enum ReportTargetType {
    COMPANY = 'company',
    USER = 'user',
    INTERNSHIP = 'internship',
}

export enum ReportStatus {
    OPEN = 'open',
    REVIEWED = 'reviewed',
    DISMISSED = 'dismissed',
    ACTION_TAKEN = 'action_taken',
}

export interface IReport {
    reporterId: Types.ObjectId
    targetType: ReportTargetType
    targetId: Types.ObjectId
    reason: string
    status: ReportStatus
    createdAt?: Date
    updatedAt?: Date
}
