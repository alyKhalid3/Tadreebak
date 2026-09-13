// One row per intern per calendar day (in the company's timezone).
// The (internId, date) compound unique index enforces that — a second
// mark for the same day upserts instead of double-counting points.
//
// Statuses (Phase 7 redesign — the admin is now the source of truth):
//   - attended: the intern was there on this required day
//   - missed:   the intern was not there, no excuse
//   - late:     the intern arrived, but late (admin's discretion)
//   - excused:  pre-approved absence (admin marked, or intern flagged)
//
// The intern's self check-in was removed — the admin marks
// retroactively based on the company schedule (see
// `IAttendanceSchedule`) and the company's `timezone` field.

import { Types } from "mongoose"

export enum AttendanceStatus {
    ATTENDED = 'attended',
    MISSED = 'missed',
    LATE = 'late',
    EXCUSED = 'excused',
}

export interface IAttendance {
    _id?: Types.ObjectId
    internId: Types.ObjectId
    companyId: Types.ObjectId
    // YYYY-MM-DD as a string. Interpreted in the company's
    // timezone (see ICompany.timezone). Stored as String (not
    // Date) so the unique compound index is a simple lex compare
    // and we sidestep timezone-induced double-write bugs.
    date: string
    status: AttendanceStatus
    note?: string
    // Whether the daily points have been awarded. Set true after
    // the points engine credits the intern. Read by retry to skip
    // already-paid rows.
    pointsAwarded?: boolean
    createdAt?: Date
    updatedAt?: Date
}
