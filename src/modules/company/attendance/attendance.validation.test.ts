// Phase 7 — Attendance (company-side) validation tests.
//
// Note: the 7-day "no backfill" window used to be enforced by the
// markAttendanceSchema refine. It was moved to the service layer
// because it needs the company's timezone to be TZ-aware (UTC-only
// math drifted around midnight for non-UTC companies). Pure shape
// validation still lives in this file.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
    listAttendanceQuerySchema,
    markAttendanceSchema,
    bulkMarkAttendanceSchema,
    attendanceInternParamSchema,
    upsertAttendanceScheduleSchema,
    getAttendanceScheduleQuerySchema,
    programIdParamSchema,
} from "./attendance.validation"
import { AttendanceStatus } from "../../../DB/types/attendance.type"

const VALID_OID = "6ab1c2d3e4f5a6b7c8d9e0f1"

// ============================================================
// listAttendanceQuerySchema
// ============================================================

test("listAttendanceQuerySchema applies defaults (page=1, limit=50)", () => {
    const parsed = listAttendanceQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 50)
})

test("listAttendanceQuerySchema coerces string page/limit", () => {
    const parsed = listAttendanceQuerySchema.parse({ page: "3", limit: "100" })
    assert.equal(parsed.page, 3)
    assert.equal(parsed.limit, 100)
})

test("listAttendanceQuerySchema rejects limit > 100", () => {
    assert.throws(
        () => listAttendanceQuerySchema.parse({ limit: "500" }),
        /Too big/i,
    )
})

test("listAttendanceQuerySchema accepts each AttendanceStatus", () => {
    for (const s of Object.values(AttendanceStatus)) {
        const parsed = listAttendanceQuerySchema.parse({ status: s })
        assert.equal(parsed.status, s)
    }
})

test("listAttendanceQuerySchema rejects an invalid status", () => {
    assert.throws(
        () => listAttendanceQuerySchema.parse({ status: "on_leave" as any }),
        /Invalid option/i,
    )
})

test("listAttendanceQuerySchema accepts a valid YYYY-MM-DD date", () => {
    const parsed = listAttendanceQuerySchema.parse({ date: "2026-09-05" })
    assert.equal(parsed.date, "2026-09-05")
})

test("listAttendanceQuerySchema rejects a malformed date", () => {
    assert.throws(
        () => listAttendanceQuerySchema.parse({ date: "2026/09/05" }),
        /YYYY-MM-DD/i,
    )
    assert.throws(
        () => listAttendanceQuerySchema.parse({ date: "09-05-2026" }),
        /YYYY-MM-DD/i,
    )
})

test("listAttendanceQuerySchema accepts a from / to range", () => {
    const parsed = listAttendanceQuerySchema.parse({
        from: "2026-01-01",
        to: "2026-01-31",
    })
    assert.equal(parsed.from, "2026-01-01")
    assert.equal(parsed.to, "2026-01-31")
})

// ============================================================
// markAttendanceSchema (Phase 7 — statuses renamed, 7-day window
// moved to the service layer)
// ============================================================

test("markAttendanceSchema accepts a valid mark (attended)", () => {
    const parsed = markAttendanceSchema.parse({
        date: "2026-09-05",
        status: AttendanceStatus.ATTENDED,
    })
    assert.equal(parsed.date, "2026-09-05")
    assert.equal(parsed.status, AttendanceStatus.ATTENDED)
})

test("markAttendanceSchema accepts each AttendanceStatus (attended, missed, late, excused)", () => {
    for (const s of Object.values(AttendanceStatus)) {
        const parsed = markAttendanceSchema.parse({ date: "2026-09-05", status: s })
        assert.equal(parsed.status, s)
    }
})

test("markAttendanceSchema rejects the legacy 'present' status (was renamed to 'attended')", () => {
    // The old enum value 'present' is gone — old callers will see
    // this as the wire format drifts. Pin the rejection so the
    // migration is obvious in tests.
    assert.throws(
        () =>
            markAttendanceSchema.parse({
                date: "2026-09-05",
                status: "present" as any,
            }),
        /Invalid option/i,
    )
})

test("markAttendanceSchema rejects the legacy 'absent' status (was renamed to 'missed')", () => {
    assert.throws(
        () =>
            markAttendanceSchema.parse({
                date: "2026-09-05",
                status: "absent" as any,
            }),
        /Invalid option/i,
    )
})

test("markAttendanceSchema rejects a malformed date", () => {
    assert.throws(
        () =>
            markAttendanceSchema.parse({
                date: "yesterday",
                status: AttendanceStatus.ATTENDED,
            }),
        /YYYY-MM-DD/i,
    )
})

test("markAttendanceSchema accepts an optional note (max 500)", () => {
    const parsed = markAttendanceSchema.parse({
        date: "2026-09-05",
        status: AttendanceStatus.EXCUSED,
        note: "Doctor's appointment",
    })
    assert.equal(parsed.note, "Doctor's appointment")
})

test("markAttendanceSchema rejects a note over 500 chars", () => {
    assert.throws(
        () =>
            markAttendanceSchema.parse({
                date: "2026-09-05",
                status: AttendanceStatus.ATTENDED,
                note: "x".repeat(501),
            }),
        /Too big/i,
    )
})

test("markAttendanceSchema trims a note", () => {
    const parsed = markAttendanceSchema.parse({
        date: "2026-09-05",
        status: AttendanceStatus.ATTENDED,
        note: "  Padded  ",
    })
    assert.equal(parsed.note, "Padded")
})

test("markAttendanceSchema rejects an empty note (trimmed)", () => {
    assert.throws(
        () =>
            markAttendanceSchema.parse({
                date: "2026-09-05",
                status: AttendanceStatus.ATTENDED,
                note: "   ",
            }),
        /Too small/i,
    )
})

// ============================================================
// attendanceInternParamSchema
// ============================================================

test("attendanceInternParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = attendanceInternParamSchema.parse({ internId: VALID_OID })
    assert.equal(parsed.internId, VALID_OID)
})

test("attendanceInternParamSchema rejects a malformed id", () => {
    assert.throws(
        () => attendanceInternParamSchema.parse({ internId: "nope" }),
        /Invalid id/i,
    )
})

// ============================================================
// bulkMarkAttendanceSchema
// ============================================================

test("bulkMarkAttendanceSchema accepts a single-row batch", () => {
    const parsed = bulkMarkAttendanceSchema.parse({
        rows: [
            { internId: VALID_OID, date: "2026-09-05", status: AttendanceStatus.MISSED },
        ],
    })
    assert.equal(parsed.rows.length, 1)
    assert.equal(parsed.rows[0]?.status, AttendanceStatus.MISSED)
})

test("bulkMarkAttendanceSchema accepts a multi-row batch with mixed statuses", () => {
    const parsed = bulkMarkAttendanceSchema.parse({
        rows: [
            { internId: VALID_OID, date: "2026-09-05", status: AttendanceStatus.ATTENDED },
            { internId: VALID_OID, date: "2026-09-06", status: AttendanceStatus.MISSED, note: "No call, no show" },
            { internId: VALID_OID, date: "2026-09-07", status: AttendanceStatus.EXCUSED, note: "Doctor's appointment" },
        ],
    })
    assert.equal(parsed.rows.length, 3)
})

test("bulkMarkAttendanceSchema rejects an empty rows array", () => {
    assert.throws(
        () => bulkMarkAttendanceSchema.parse({ rows: [] }),
        /Too small/i,
    )
})

test("bulkMarkAttendanceSchema rejects a malformed internId inside rows", () => {
    assert.throws(
        () =>
            bulkMarkAttendanceSchema.parse({
                rows: [
                    { internId: "nope", date: "2026-09-05", status: AttendanceStatus.ATTENDED },
                ],
            }),
        /Invalid id/i,
    )
})

test("bulkMarkAttendanceSchema rejects a malformed date inside rows", () => {
    assert.throws(
        () =>
            bulkMarkAttendanceSchema.parse({
                rows: [
                    { internId: VALID_OID, date: "yesterday", status: AttendanceStatus.ATTENDED },
                ],
            }),
        /YYYY-MM-DD/i,
    )
})

test("bulkMarkAttendanceSchema rejects the legacy 'present' status inside rows", () => {
    assert.throws(
        () =>
            bulkMarkAttendanceSchema.parse({
                rows: [
                    { internId: VALID_OID, date: "2026-09-05", status: "present" as any },
                ],
            }),
        /Invalid option/i,
    )
})

test("bulkMarkAttendanceSchema rejects a note over 500 chars inside rows", () => {
    assert.throws(
        () =>
            bulkMarkAttendanceSchema.parse({
                rows: [
                    {
                        internId: VALID_OID,
                        date: "2026-09-05",
                        status: AttendanceStatus.ATTENDED,
                        note: "x".repeat(501),
                    },
                ],
            }),
        /Too big/i,
    )
})

test("bulkMarkAttendanceSchema trims a note inside rows", () => {
    const parsed = bulkMarkAttendanceSchema.parse({
        rows: [
            {
                internId: VALID_OID,
                date: "2026-09-05",
                status: AttendanceStatus.ATTENDED,
                note: "  Padded  ",
            },
        ],
    })
    assert.equal(parsed.rows[0]?.note, "Padded")
})

test("bulkMarkAttendanceSchema rejects a missing rows field", () => {
    assert.throws(
        () => bulkMarkAttendanceSchema.parse({}),
        /invalid_type/i,
    )
})

// ============================================================
// upsertAttendanceScheduleSchema
// ============================================================

const mwOnly = {
    sunday: false,
    monday: true,
    tuesday: true,
    wednesday: false,
    thursday: false,
    friday: true,
    saturday: false,
}

const fullWeek = {
    sunday: true,
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
}

const emptyWeek = {
    sunday: false,
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
}

test("upsertAttendanceScheduleSchema accepts a company-default schedule (no programId)", () => {
    const parsed = upsertAttendanceScheduleSchema.parse({
        weeklyPattern: mwOnly,
    })
    assert.equal(parsed.programId, undefined)
    assert.equal(parsed.weeklyPattern.monday, true)
})

test("upsertAttendanceScheduleSchema accepts a per-program override", () => {
    const parsed = upsertAttendanceScheduleSchema.parse({
        programId: VALID_OID,
        weeklyPattern: fullWeek,
    })
    assert.equal(parsed.programId, VALID_OID)
})

test("upsertAttendanceScheduleSchema accepts an optional effectiveFrom/effectiveTo range", () => {
    const parsed = upsertAttendanceScheduleSchema.parse({
        weeklyPattern: mwOnly,
        effectiveFrom: "2026-06-01",
        effectiveTo: "2026-08-31",
    })
    assert.equal(parsed.effectiveFrom, "2026-06-01")
    assert.equal(parsed.effectiveTo, "2026-08-31")
})

test("upsertAttendanceScheduleSchema accepts an explicit null effectiveTo (open-ended)", () => {
    const parsed = upsertAttendanceScheduleSchema.parse({
        weeklyPattern: mwOnly,
        effectiveFrom: "2026-06-01",
        effectiveTo: null,
    })
    assert.equal(parsed.effectiveTo, null)
})

test("upsertAttendanceScheduleSchema rejects effectiveTo before effectiveFrom", () => {
    assert.throws(
        () =>
            upsertAttendanceScheduleSchema.parse({
                weeklyPattern: mwOnly,
                effectiveFrom: "2026-08-31",
                effectiveTo: "2026-06-01",
            }),
        /effectiveTo must be on or after effectiveFrom/i,
    )
})

test("upsertAttendanceScheduleSchema rejects a weeklyPattern with no required days", () => {
    assert.throws(
        () =>
            upsertAttendanceScheduleSchema.parse({
                weeklyPattern: emptyWeek,
            }),
        /At least one day of the week must be required/i,
    )
})

test("upsertAttendanceScheduleSchema rejects missing weeklyPattern keys", () => {
    assert.throws(
        () =>
            upsertAttendanceScheduleSchema.parse({
                weeklyPattern: {
                    sunday: false,
                    monday: true,
                    // missing the other 5
                } as any,
            }),
        // Zod reports each missing field as `invalid_type` (the value
        // is `undefined`). The schema is required at the parent level
        // — partial weeklyPattern is rejected.
        /invalid_type/i,
    )
})

test("upsertAttendanceScheduleSchema rejects non-boolean day values", () => {
    assert.throws(
        () =>
            upsertAttendanceScheduleSchema.parse({
                weeklyPattern: {
                    sunday: "yes" as any,
                    monday: true,
                    tuesday: true,
                    wednesday: true,
                    thursday: true,
                    friday: true,
                    saturday: true,
                },
            }),
        /Invalid/,
    )
})

test("upsertAttendanceScheduleSchema rejects a malformed effectiveFrom", () => {
    assert.throws(
        () =>
            upsertAttendanceScheduleSchema.parse({
                weeklyPattern: mwOnly,
                effectiveFrom: "06/01/2026",
            }),
        /YYYY-MM-DD/i,
    )
})

test("upsertAttendanceScheduleSchema rejects a malformed programId", () => {
    assert.throws(
        () =>
            upsertAttendanceScheduleSchema.parse({
                programId: "nope",
                weeklyPattern: mwOnly,
            }),
        /Invalid id/i,
    )
})

// ============================================================
// getAttendanceScheduleQuerySchema
// ============================================================

test("getAttendanceScheduleQuerySchema accepts a missing programId (company default)", () => {
    const parsed = getAttendanceScheduleQuerySchema.parse({})
    assert.equal(parsed.programId, undefined)
})

test("getAttendanceScheduleQuerySchema accepts a valid programId", () => {
    const parsed = getAttendanceScheduleQuerySchema.parse({ programId: VALID_OID })
    assert.equal(parsed.programId, VALID_OID)
})

test("getAttendanceScheduleQuerySchema rejects a malformed programId", () => {
    assert.throws(
        () => getAttendanceScheduleQuerySchema.parse({ programId: "nope" }),
        /Invalid id/i,
    )
})

// ============================================================
// programIdParamSchema
// ============================================================

test("programIdParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = programIdParamSchema.parse({ programId: VALID_OID })
    assert.equal(parsed.programId, VALID_OID)
})

test("programIdParamSchema rejects a malformed id", () => {
    assert.throws(
        () => programIdParamSchema.parse({ programId: "nope" }),
        /Invalid id/i,
    )
})
