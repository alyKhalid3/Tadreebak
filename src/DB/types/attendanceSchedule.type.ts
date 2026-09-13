// Attendance schedule — the "which days is the intern required to
// attend?" table that the admin maintains.
//
// Scope (Phase 7 decision):
//   - programId is optional. When set, this schedule overrides the
//     company default for interns in that program.
//   - When programId is null/undefined, this is the company-wide
//     default schedule.
//   - One schedule per (companyId, programId) pair — enforced by a
//     unique compound index on the model.
//
// weeklyPattern is the day-of-week bitmask. effectiveFrom /
// effectiveTo let the admin scope a schedule to a date range (e.g.
// "Summer 2026 batch runs Sun-Thu from Jun 1 to Aug 31").

import { Types } from "mongoose"

// 7 booleans — sunday through saturday. Stored as an object (not a
// bitmask number) so the response shape is human-readable on the
// client. The 7 keys are stable; adding more would be a schema change.
export interface IWeeklyPattern {
    sunday: boolean
    monday: boolean
    tuesday: boolean
    wednesday: boolean
    thursday: boolean
    friday: boolean
    saturday: boolean
}

export interface IAttendanceSchedule {
    _id?: Types.ObjectId
    companyId: Types.ObjectId
    // Optional programId — null/undefined means "company default".
    programId?: Types.ObjectId | null
    weeklyPattern: IWeeklyPattern
    // Optional date-range scope. effectiveFrom is inclusive;
    // effectiveTo is inclusive. Null/undefined effectiveTo = open-ended.
    effectiveFrom?: Date
    effectiveTo?: Date | null
    createdAt?: Date
    updatedAt?: Date
}
