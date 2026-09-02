// Unit tests for the Programs validation schemas.
//
// The schemas are pure zod objects so we don't need a DB or Express
// instance — schema.parse(schema.parse) is the contract. These tests
// pin the shape that the controller/service layer depends on, so
// refactors don't accidentally relax a constraint (e.g. dropping the
// ObjectId regex would let any string through and break `$lookup`
// later in the service).
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    createProgramSchema,
    updateProgramSchema,
    listProgramsQuerySchema,
    programIdParamSchema,
    enrollInternsSchema,
    unenrollInternSchema,
} from "./programs.validation"

const VALID_OID = "6ab1c2d3e4f5a6b7c8d9e0f1"

test("createProgramSchema accepts a minimal valid program", () => {
    const parsed = createProgramSchema.parse({
        name: "Summer 2026",
        startDate: "2026-06-01T00:00:00.000Z",
    })
    assert.equal(parsed.name, "Summer 2026")
    assert.equal(parsed.startDate instanceof Date, true)
    assert.equal(parsed.endDate, undefined)
    assert.equal(parsed.maxInterns, undefined)
    assert.equal(parsed.coverImage, undefined)
})

test("createProgramSchema trims the name", () => {
    const parsed = createProgramSchema.parse({
        name: "   Padded Name  ",
        startDate: "2026-06-01",
    })
    assert.equal(parsed.name, "Padded Name")
})

test("createProgramSchema coerces startDate from string, number, and Date", () => {
    const fromStr = createProgramSchema.parse({ name: "AA", startDate: "2026-06-01" })
    const fromNum = createProgramSchema.parse({ name: "BB", startDate: 1717200000000 })
    const fromDate = createProgramSchema.parse({ name: "CC", startDate: new Date(0) })
    assert.equal(fromStr.startDate instanceof Date, true)
    assert.equal(fromNum.startDate instanceof Date, true)
    assert.equal(fromDate.startDate instanceof Date, true)
})

test("createProgramSchema rejects name shorter than 2 chars", () => {
    assert.throws(
        () => createProgramSchema.parse({ name: "A", startDate: "2026-06-01" }),
        /Too small/i,
    )
})

test("createProgramSchema rejects name longer than 100 chars", () => {
    const long = "x".repeat(101)
    assert.throws(
        () => createProgramSchema.parse({ name: long, startDate: "2026-06-01" }),
        /Too big/i,
    )
})

test("createProgramSchema rejects startDate that isn't a date", () => {
    assert.throws(
        () => createProgramSchema.parse({ name: "AA", startDate: "not-a-date" }),
        /invalid date/i,
    )
})

test("createProgramSchema accepts endDate and maxInterns when within range", () => {
    const parsed = createProgramSchema.parse({
        name: "AA",
        startDate: "2026-06-01",
        endDate: "2026-09-01",
        maxInterns: 25,
    })
    assert.equal(parsed.maxInterns, 25)
    assert.equal(parsed.endDate instanceof Date, true)
})

test("createProgramSchema allows endDate: null to explicitly close a program", () => {
    const parsed = createProgramSchema.parse({
        name: "AA",
        startDate: "2026-06-01",
        endDate: null,
    })
    assert.equal(parsed.endDate, null)
})

test("createProgramSchema rejects maxInterns outside [1, 1000]", () => {
    assert.throws(
        () =>
            createProgramSchema.parse({
                name: "AA",
                startDate: "2026-06-01",
                maxInterns: 0,
            }),
        /Too small/i,
    )
    assert.throws(
        () =>
            createProgramSchema.parse({
                name: "AA",
                startDate: "2026-06-01",
                maxInterns: 5000,
            }),
        /Too big/i,
    )
})

test("createProgramSchema accepts a valid coverImage with public_id + secure_url", () => {
    const parsed = createProgramSchema.parse({
        name: "AA",
        startDate: "2026-06-01",
        coverImage: { public_id: "abc", secure_url: "https://x.cloudinary.com/y.jpg" },
    })
    assert.deepEqual(parsed.coverImage, { public_id: "abc", secure_url: "https://x.cloudinary.com/y.jpg" })
})

test("createProgramSchema rejects coverImage with a non-URL secure_url", () => {
    assert.throws(
        () =>
            createProgramSchema.parse({
                name: "AA",
                startDate: "2026-06-01",
                coverImage: { public_id: "abc", secure_url: "not-a-url" },
            }),
        /url/i,
    )
})

test("createProgramSchema rejects missing startDate", () => {
    assert.throws(
        () => createProgramSchema.parse({ name: "AA" }),
        /startDate/i,
    )
})

test("updateProgramSchema makes every field optional", () => {
    const parsed = updateProgramSchema.parse({})
    assert.deepEqual(parsed, {})
})

test("updateProgramSchema accepts partial updates", () => {
    const parsed = updateProgramSchema.parse({
        name: "  New Name  ",
        status: "completed",
    })
    assert.equal(parsed.name, "New Name")
    assert.equal(parsed.status, "completed")
})

test("updateProgramSchema rejects an invalid status enum value", () => {
    assert.throws(
        () => updateProgramSchema.parse({ status: "bogus" as any }),
        /Invalid option/i,
    )
})

test("updateProgramSchema accepts every ProgramStatus enum value", () => {
    for (const s of ["upcoming", "active", "completed", "archived"] as const) {
        const parsed = updateProgramSchema.parse({ status: s })
        assert.equal(parsed.status, s)
    }
})

test("listProgramsQuerySchema applies defaults and coerces page/limit", () => {
    const parsed = listProgramsQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
    assert.equal(parsed.status, undefined)
})

test("listProgramsQuerySchema coerces string page/limit (Express query is always string)", () => {
    const parsed = listProgramsQuerySchema.parse({ page: "3", limit: "50" })
    assert.equal(parsed.page, 3)
    assert.equal(parsed.limit, 50)
})

test("listProgramsQuerySchema rejects limit > 100", () => {
    assert.throws(() => listProgramsQuerySchema.parse({ limit: "500" }), /Too big/i)
})

test("listProgramsQuerySchema rejects page < 1", () => {
    assert.throws(() => listProgramsQuerySchema.parse({ page: "0" }), /Too small/i)
})

test("listProgramsQuerySchema rejects an invalid status", () => {
    assert.throws(() => listProgramsQuerySchema.parse({ status: "nope" as any }), /Invalid option/i)
})

test("programIdParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = programIdParamSchema.parse({ programId: VALID_OID })
    assert.equal(parsed.programId, VALID_OID)
})

test("programIdParamSchema rejects a 23-char id (too short)", () => {
    assert.throws(
        () => programIdParamSchema.parse({ programId: VALID_OID.slice(1) }),
        /invalid id/i,
    )
})

test("programIdParamSchema rejects a 25-char id (too long)", () => {
    assert.throws(
        () => programIdParamSchema.parse({ programId: VALID_OID + "0" }),
        /invalid id/i,
    )
})

test("programIdParamSchema rejects non-hex characters", () => {
    // 24 chars but with z's — still not hex
    assert.throws(
        () => programIdParamSchema.parse({ programId: "zzzzzzzzzzzzzzzzzzzzzzzz" }),
        /invalid id/i,
    )
})

test("enrollInternsSchema accepts 1-200 valid ObjectIds", () => {
    const ids = Array.from({ length: 5 }, (_, i) =>
        VALID_OID.slice(0, 23) + i.toString(16),
    )
    const parsed = enrollInternsSchema.parse({ internIds: ids })
    assert.equal(parsed.internIds.length, 5)
})

test("enrollInternsSchema rejects an empty internIds array", () => {
    assert.throws(
        () => enrollInternsSchema.parse({ internIds: [] }),
        /Too small/i,
    )
})

test("enrollInternsSchema rejects an internIds array with an invalid id", () => {
    assert.throws(
        () => enrollInternsSchema.parse({ internIds: ["not-an-id", VALID_OID] }),
        /invalid id/i,
    )
})

test("enrollInternsSchema rejects an internIds array with more than 200 items", () => {
    const ids = Array.from({ length: 201 }, (_, i) =>
        VALID_OID.slice(0, 23) + i.toString(16).padStart(1, "0"),
    )
    // Last id is invalid because we pad poorly — fix by ensuring the last char is hex
    const safe = Array.from({ length: 201 }, (_, i) =>
        (VALID_OID.slice(0, 23) + (i % 16).toString(16)),
    )
    assert.throws(() => enrollInternsSchema.parse({ internIds: safe }), /Too big/i)
})

test("unenrollInternSchema requires both programId and internId", () => {
    const parsed = unenrollInternSchema.parse({
        programId: VALID_OID,
        internId: VALID_OID,
    })
    assert.equal(parsed.programId, VALID_OID)
    assert.equal(parsed.internId, VALID_OID)
})

test("unenrollInternSchema rejects a bad internId", () => {
    assert.throws(
        () => unenrollInternSchema.parse({ programId: VALID_OID, internId: "nope" }),
        /invalid id/i,
    )
})
