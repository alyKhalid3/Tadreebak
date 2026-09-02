// Unit tests for the Interns validation schemas.
//
// These schemas gate the dashboard roster endpoint. The status enum,
// sort enum, and ObjectId filters are the contract the frontend's
// dashboard table depends on — a regression here would silently
// change the URL contract.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    listInternsQuerySchema,
    internIdParamSchema,
} from "./interns.validation"

const VALID_OID = "6ab1c2d3e4f5a6b7c8d9e0f1"

test("listInternsQuerySchema applies defaults: status=all, sort=recent, page=1, limit=20", () => {
    const parsed = listInternsQuerySchema.parse({})
    assert.equal(parsed.status, "all")
    assert.equal(parsed.sort, "recent")
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
})

test("listInternsQuerySchema accepts each valid status", () => {
    for (const s of ["active", "alumni", "all"] as const) {
        const parsed = listInternsQuerySchema.parse({ status: s })
        assert.equal(parsed.status, s)
    }
})

test("listInternsQuerySchema rejects an invalid status", () => {
    assert.throws(
        () => listInternsQuerySchema.parse({ status: "former" as any }),
        /Invalid option/i,
    )
})

test("listInternsQuerySchema accepts each valid sort", () => {
    for (const s of ["recent", "name", "points"] as const) {
        const parsed = listInternsQuerySchema.parse({ sort: s })
        assert.equal(parsed.sort, s)
    }
})

test("listInternsQuerySchema rejects an invalid sort (Phase 6 will add 'score')", () => {
    assert.throws(
        () => listInternsQuerySchema.parse({ sort: "score" as any }),
        /Invalid option/i,
    )
})

test("listInternsQuerySchema coerces string page/limit (Express query strings)", () => {
    const parsed = listInternsQuerySchema.parse({ page: "4", limit: "40" })
    assert.equal(parsed.page, 4)
    assert.equal(parsed.limit, 40)
})

test("listInternsQuerySchema rejects limit > 100", () => {
    assert.throws(
        () => listInternsQuerySchema.parse({ limit: "200" }),
        /Too big/i,
    )
})

test("listInternsQuerySchema rejects page < 1", () => {
    assert.throws(
        () => listInternsQuerySchema.parse({ page: "0" }),
        /Too small/i,
    )
})

test("listInternsQuerySchema accepts an optional programId filter when valid", () => {
    const parsed = listInternsQuerySchema.parse({ programId: VALID_OID })
    assert.equal(parsed.programId, VALID_OID)
})

test("listInternsQuerySchema rejects a malformed programId filter", () => {
    assert.throws(
        () => listInternsQuerySchema.parse({ programId: "nope" }),
        /invalid id/i,
    )
})

test("listInternsQuerySchema accepts an optional projectId filter when valid", () => {
    const parsed = listInternsQuerySchema.parse({ projectId: VALID_OID })
    assert.equal(parsed.projectId, VALID_OID)
})

test("listInternsQuerySchema rejects a malformed projectId filter", () => {
    assert.throws(
        () => listInternsQuerySchema.parse({ projectId: "nope" }),
        /invalid id/i,
    )
})

test("listInternsQuerySchema trims a search string", () => {
    const parsed = listInternsQuerySchema.parse({ search: "   ali  " })
    assert.equal(parsed.search, "ali")
})

test("listInternsQuerySchema rejects an empty search string after trim", () => {
    assert.throws(
        () => listInternsQuerySchema.parse({ search: "   " }),
        /Too small/i,
    )
})

test("listInternsQuerySchema rejects a search string over 100 chars", () => {
    assert.throws(
        () => listInternsQuerySchema.parse({ search: "x".repeat(101) }),
        /Too big/i,
    )
})

test("listInternsQuerySchema accepts a search string of exactly 100 chars", () => {
    const parsed = listInternsQuerySchema.parse({ search: "x".repeat(100) })
    assert.equal(parsed.search?.length, 100)
})

test("listInternsQuerySchema accepts a full filter combination", () => {
    const parsed = listInternsQuerySchema.parse({
        programId: VALID_OID,
        projectId: VALID_OID,
        status: "active",
        search: "ali",
        sort: "name",
        page: "2",
        limit: "10",
    })
    assert.equal(parsed.programId, VALID_OID)
    assert.equal(parsed.projectId, VALID_OID)
    assert.equal(parsed.status, "active")
    assert.equal(parsed.search, "ali")
    assert.equal(parsed.sort, "name")
    assert.equal(parsed.page, 2)
    assert.equal(parsed.limit, 10)
})

test("internIdParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = internIdParamSchema.parse({ internId: VALID_OID })
    assert.equal(parsed.internId, VALID_OID)
})

test("internIdParamSchema rejects a malformed id", () => {
    assert.throws(
        () => internIdParamSchema.parse({ internId: "nope" }),
        /invalid id/i,
    )
    assert.throws(
        () => internIdParamSchema.parse({ internId: VALID_OID.slice(0, 5) }),
        /invalid id/i,
    )
})
