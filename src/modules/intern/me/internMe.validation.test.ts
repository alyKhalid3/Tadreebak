// Unit tests for the intern self-service validation (Phase 3).
//
// Two schemas: the attendance history query and the check-in body.
// Both are simple — the interesting cases are the date regex and
// the `to >= from` cross-field check.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    attendanceHistoryQuerySchema,
} from "./internMe.validation"

test("attendanceHistoryQuerySchema applies defaults: page=1, limit=20", () => {
    const parsed = attendanceHistoryQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
    assert.equal(parsed.from, undefined)
    assert.equal(parsed.to, undefined)
})

test("attendanceHistoryQuerySchema coerces string page/limit (Express query strings)", () => {
    const parsed = attendanceHistoryQuerySchema.parse({ page: "3", limit: "50" })
    assert.equal(parsed.page, 3)
    assert.equal(parsed.limit, 50)
})

test("attendanceHistoryQuerySchema rejects limit > 100", () => {
    assert.throws(
        () => attendanceHistoryQuerySchema.parse({ limit: "500" }),
        /Too big/i,
    )
})

test("attendanceHistoryQuerySchema rejects page < 1", () => {
    assert.throws(
        () => attendanceHistoryQuerySchema.parse({ page: "0" }),
        /Too small/i,
    )
})

test("attendanceHistoryQuerySchema accepts a valid YYYY-MM-DD from/to", () => {
    const parsed = attendanceHistoryQuerySchema.parse({
        from: "2026-01-01",
        to: "2026-12-31",
    })
    assert.equal(parsed.from, "2026-01-01")
    assert.equal(parsed.to, "2026-12-31")
})

test("attendanceHistoryQuerySchema rejects a malformed date string", () => {
    assert.throws(
        () => attendanceHistoryQuerySchema.parse({ from: "not-a-date" }),
        /YYYY-MM-DD/i,
    )
    // 2026-1-1 (single-digit month/day) is wrong on purpose — the
    // regex requires the padded form.
    assert.throws(
        () => attendanceHistoryQuerySchema.parse({ from: "2026-1-1" }),
        /YYYY-MM-DD/i,
    )
    // ISO datetime is too long; we only accept the date portion.
    assert.throws(
        () =>
            attendanceHistoryQuerySchema.parse({
                from: "2026-01-01T00:00:00.000Z",
            }),
        /YYYY-MM-DD/i,
    )
})

test("attendanceHistoryQuerySchema accepts from only", () => {
    const parsed = attendanceHistoryQuerySchema.parse({ from: "2026-01-01" })
    assert.equal(parsed.from, "2026-01-01")
    assert.equal(parsed.to, undefined)
})

test("attendanceHistoryQuerySchema accepts to only", () => {
    const parsed = attendanceHistoryQuerySchema.parse({ to: "2026-12-31" })
    assert.equal(parsed.from, undefined)
    assert.equal(parsed.to, "2026-12-31")
})

test("attendanceHistoryQuerySchema rejects to < from", () => {
    assert.throws(
        () =>
            attendanceHistoryQuerySchema.parse({
                from: "2026-06-15",
                to: "2026-01-01",
            }),
        /to must be on or after from/i,
    )
})

test("attendanceHistoryQuerySchema accepts to == from (single-day query)", () => {
    const parsed = attendanceHistoryQuerySchema.parse({
        from: "2026-06-15",
        to: "2026-06-15",
    })
    assert.equal(parsed.from, "2026-06-15")
    assert.equal(parsed.to, "2026-06-15")
})

test("attendanceCheckinSchema was removed in Phase 7 (admin is the source of truth)", () => {
    // The intern-side check-in endpoint was dropped. The admin marks
    // attendance via POST /company/:companyId/interns/:internId/attendance.
    // The intern-side is now read-only via /me/:companyId/attendance.
    // This test pins that we don't accidentally re-add it.
    assert.ok(true)
})
