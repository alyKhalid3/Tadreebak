// Phase 7 — company-side attendance validation. Two layers:
//
//   1. Pure shape validation (this file):
//      - date is YYYY-MM-DD
//      - status is one of AttendanceStatus
//      - internId / companyId are ObjectIds
//      - weeklyPattern has all 7 boolean keys
//
//   2. Business-rule validation (the service):
//      - date is within the last 7 days (in the company's timezone)
//      - mark row exists for that (internId, date) pair
//      - schedule's weeklyPattern has at least one required day
//
// The TZ-aware checks live in the service so they can read the
// company's `timezone` field.

import { z } from "zod"
import { AttendanceStatus } from "../../../DB/types/attendance.type"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id")
const dateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")

// The 7 day-of-week booleans. At least one must be `true` (the
// service enforces this as well; the Zod refine gives a cleaner
// 400 with field-level error info).
const weeklyPattern = z
    .object({
        sunday: z.boolean(),
        monday: z.boolean(),
        tuesday: z.boolean(),
        wednesday: z.boolean(),
        thursday: z.boolean(),
        friday: z.boolean(),
        saturday: z.boolean(),
    })
    .refine(
        (p) =>
            p.sunday ||
            p.monday ||
            p.tuesday ||
            p.wednesday ||
            p.thursday ||
            p.friday ||
            p.saturday,
        { message: "At least one day of the week must be required" },
    )

export const listAttendanceQuerySchema = z.object({
    internId: objectId.optional(),
    // A specific date — returns the rows for that day across all interns.
    date: dateString.optional(),
    // Date range. `from` defaults to 30 days ago; `to` defaults to today.
    from: dateString.optional(),
    to: dateString.optional(),
    status: z.nativeEnum(AttendanceStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const markAttendanceSchema = z.object({
    date: dateString,
    status: z.nativeEnum(AttendanceStatus),
    note: z.string().trim().min(1).max(500).optional(),
})

// Bulk-mark: a list of rows the admin wants to upsert in one
// round-trip. The per-row checks (active enrollment, 7-day
// window) are best-effort at the service layer — failed rows go
// into `skipped[]` in the response, successful rows go into
// `marked[]`. Capped at 500 rows per call as a sanity limit.
export const bulkMarkAttendanceSchema = z.object({
    rows: z
        .array(
            z.object({
                internId: objectId,
                date: dateString,
                status: z.nativeEnum(AttendanceStatus),
                note: z.string().trim().min(1).max(500).optional(),
            }),
        )
        .min(1)
        .max(500),
})

export const attendanceInternParamSchema = z.object({
    internId: objectId,
})

// ----- Attendance schedule -----

// Create or update the schedule for the (company, program?) pair.
// programId is optional; when absent it's the company default.
export const upsertAttendanceScheduleSchema = z
    .object({
        programId: objectId.optional(),
        weeklyPattern,
        effectiveFrom: dateString.optional(),
        effectiveTo: dateString.optional().nullable(),
    })
    .refine(
        (s) => {
            // If both bounds are present, `effectiveTo` must be on or
            // after `effectiveFrom`.
            if (!s.effectiveFrom || !s.effectiveTo) return true
            return s.effectiveTo >= s.effectiveFrom
        },
        { message: "effectiveTo must be on or after effectiveFrom", path: ["effectiveTo"] },
    )

// Fetch the schedule. Pass `programId` to fetch a per-program
// override; omit it to fetch the company default.
export const getAttendanceScheduleQuerySchema = z.object({
    programId: objectId.optional(),
})

// 24-char ObjectId for the optional :programId path param on the
// schedule CRUD endpoints.
export const programIdParamSchema = z.object({
    programId: objectId,
})
