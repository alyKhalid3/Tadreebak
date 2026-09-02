// Unit tests for the Projects validation schemas.
//
// The schema rules are the contract the service layer depends on (e.g.
// `programId` must be a real ObjectId before we run a $lookup; the
// hex color regex must accept only `#RRGGBB` so we don't render broken
// CSS in the dashboard). These tests pin those rules.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    createProjectSchema,
    updateProjectSchema,
    listProjectsQuerySchema,
    projectIdParamSchema,
    assignInternsSchema,
} from "./projects.validation"

const VALID_OID = "6ab1c2d3e4f5a6b7c8d9e0f1"

test("createProjectSchema accepts a minimal valid project (name only)", () => {
    const parsed = createProjectSchema.parse({ name: "Backend Rewrite" })
    assert.equal(parsed.name, "Backend Rewrite")
    assert.equal(parsed.description, undefined)
    assert.equal(parsed.programId, undefined)
    assert.equal(parsed.internIds, undefined)
    assert.equal(parsed.startDate, undefined)
    assert.equal(parsed.endDate, undefined)
    assert.equal(parsed.color, undefined)
})

test("createProjectSchema trims the name", () => {
    const parsed = createProjectSchema.parse({ name: "  Spaced  " })
    assert.equal(parsed.name, "Spaced")
})

test("createProjectSchema rejects name shorter than 2 chars", () => {
    assert.throws(() => createProjectSchema.parse({ name: "A" }), /Too small/i)
})

test("createProjectSchema accepts a valid hex color", () => {
    const parsed = createProjectSchema.parse({ name: "AA", color: "#10b981" })
    assert.equal(parsed.color, "#10b981")
})

test("createProjectSchema accepts both lowercase and uppercase hex", () => {
    const lower = createProjectSchema.parse({ name: "AA", color: "#abcdef" })
    const upper = createProjectSchema.parse({ name: "BB", color: "#ABCDEF" })
    assert.equal(lower.color, "#abcdef")
    assert.equal(upper.color, "#ABCDEF")
})

test("createProjectSchema rejects a 3-digit shorthand hex", () => {
    // Frontend uses full 6-digit only; reject #abc so we don't ship half-styled chips
    assert.throws(
        () => createProjectSchema.parse({ name: "AA", color: "#abc" }),
        /hex color/i,
    )
})

test("createProjectSchema rejects a non-hex color string", () => {
    assert.throws(
        () => createProjectSchema.parse({ name: "AA", color: "red" }),
        /hex color/i,
    )
    assert.throws(
        () => createProjectSchema.parse({ name: "AA", color: "#GGGGGG" }),
        /hex color/i,
    )
})

test("createProjectSchema rejects a hex with the wrong prefix (no #)", () => {
    assert.throws(
        () => createProjectSchema.parse({ name: "AA", color: "10b981" }),
        /hex color/i,
    )
})

test("createProjectSchema accepts an optional programId when it is a valid ObjectId", () => {
    const parsed = createProjectSchema.parse({ name: "AA", programId: VALID_OID })
    assert.equal(parsed.programId, VALID_OID)
})

test("createProjectSchema rejects a malformed programId", () => {
    assert.throws(
        () => createProjectSchema.parse({ name: "AA", programId: "nope" }),
        /invalid id/i,
    )
})

test("createProjectSchema accepts up to 200 internIds and rejects more", () => {
    const safe = Array.from({ length: 200 }, (_, i) =>
        VALID_OID.slice(0, 23) + (i % 16).toString(16),
    )
    const parsed = createProjectSchema.parse({ name: "AA", internIds: safe })
    assert.equal(parsed.internIds?.length, 200)

    const tooMany = Array.from({ length: 201 }, (_, i) =>
        VALID_OID.slice(0, 23) + (i % 16).toString(16),
    )
    assert.throws(
        () => createProjectSchema.parse({ name: "AA", internIds: tooMany }),
        /Too big/i,
    )
})

test("createProjectSchema accepts an empty internIds array (vacuous — none to assign)", () => {
    const parsed = createProjectSchema.parse({ name: "AA", internIds: [] })
    assert.deepEqual(parsed.internIds, [])
})

test("createProjectSchema rejects internIds with a non-oid entry", () => {
    assert.throws(
        () => createProjectSchema.parse({ name: "AA", internIds: [VALID_OID, "nope"] }),
        /invalid id/i,
    )
})

test("createProjectSchema coerces startDate and accepts endDate: null", () => {
    const parsed = createProjectSchema.parse({
        name: "AA",
        startDate: "2026-06-01",
        endDate: null,
    })
    assert.equal(parsed.startDate instanceof Date, true)
    assert.equal(parsed.endDate, null)
})

test("updateProjectSchema makes every field optional", () => {
    const parsed = updateProjectSchema.parse({})
    assert.deepEqual(parsed, {})
})

test("updateProjectSchema accepts a status update with a valid ProjectStatus", () => {
    for (const s of ["active", "completed", "archived"] as const) {
        const parsed = updateProjectSchema.parse({ status: s })
        assert.equal(parsed.status, s)
    }
})

test("updateProjectSchema rejects an invalid ProjectStatus", () => {
    assert.throws(
        () => updateProjectSchema.parse({ status: "weird" as any }),
        /Invalid option/i,
    )
})

test("updateProjectSchema accepts a color update that is a valid hex", () => {
    const parsed = updateProjectSchema.parse({ color: "#ff0000" })
    assert.equal(parsed.color, "#ff0000")
})

test("updateProjectSchema rejects an invalid hex color update", () => {
    // updateProjectSchema's color regex has no custom message, so the
    // error is just `invalid_format` / format=regex. The contract is
    // that the parse throws, not the specific wording.
    assert.throws(() => updateProjectSchema.parse({ color: "red" }))
})

test("listProjectsQuerySchema applies defaults and coerces page/limit", () => {
    const parsed = listProjectsQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
})

test("listProjectsQuerySchema accepts an optional programId filter", () => {
    const parsed = listProjectsQuerySchema.parse({ programId: VALID_OID })
    assert.equal(parsed.programId, VALID_OID)
})

test("listProjectsQuerySchema rejects a malformed programId filter", () => {
    assert.throws(
        () => listProjectsQuerySchema.parse({ programId: "nope" }),
        /invalid id/i,
    )
})

test("listProjectsQuerySchema rejects limit > 100", () => {
    assert.throws(() => listProjectsQuerySchema.parse({ limit: "500" }), /Too big/i)
})

test("listProjectsQuerySchema rejects an invalid status filter", () => {
    assert.throws(
        () => listProjectsQuerySchema.parse({ status: "nope" as any }),
        /Invalid option/i,
    )
})

test("projectIdParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = projectIdParamSchema.parse({ projectId: VALID_OID })
    assert.equal(parsed.projectId, VALID_OID)
})

test("projectIdParamSchema rejects a bad ObjectId (too short)", () => {
    assert.throws(
        () => projectIdParamSchema.parse({ projectId: "abc" }),
        /invalid id/i,
    )
})

test("assignInternsSchema requires at least one internId", () => {
    assert.throws(() => assignInternsSchema.parse({ internIds: [] }), /Too small/i)
})

test("assignInternsSchema accepts 1-200 valid ObjectIds", () => {
    const ids = Array.from({ length: 100 }, (_, i) =>
        VALID_OID.slice(0, 23) + (i % 16).toString(16),
    )
    const parsed = assignInternsSchema.parse({ internIds: ids })
    assert.equal(parsed.internIds.length, 100)
})

test("assignInternsSchema rejects an internId that is not an ObjectId", () => {
    assert.throws(
        () => assignInternsSchema.parse({ internIds: ["bad", VALID_OID] }),
        /invalid id/i,
    )
})

test("assignInternsSchema rejects more than 200 internIds", () => {
    const tooMany = Array.from({ length: 201 }, (_, i) =>
        VALID_OID.slice(0, 23) + (i % 16).toString(16),
    )
    assert.throws(
        () => assignInternsSchema.parse({ internIds: tooMany }),
        /Too big/i,
    )
})
