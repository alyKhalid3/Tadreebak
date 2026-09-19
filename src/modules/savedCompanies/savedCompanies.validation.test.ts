import { test } from "node:test";
import assert from "node:assert/strict";
import {
    companyIdParamSchema,
    listSavedCompaniesQuerySchema,
} from "./savedCompanies.validation";

// ---------------------------------------------------------------------------
// companyIdParamSchema
// ---------------------------------------------------------------------------

test("companyIdParamSchema accepts a 24-char hex id", () => {
    const id = "6ab1d2e3f4a5b6c7d8e9f0a1"
    const parsed = companyIdParamSchema.parse({ id })
    assert.equal(parsed.id, id)
})

test("companyIdParamSchema rejects a short id", () => {
    assert.throws(() => companyIdParamSchema.parse({ id: "abc" }))
})

test("companyIdParamSchema rejects a non-hex id", () => {
    assert.throws(() => companyIdParamSchema.parse({ id: "not-an-objectid" }))
})

test("companyIdParamSchema rejects missing id", () => {
    assert.throws(() => companyIdParamSchema.parse({}))
})

// ---------------------------------------------------------------------------
// listSavedCompaniesQuerySchema
// ---------------------------------------------------------------------------

test("listSavedCompaniesQuerySchema defaults page=1, limit=10", () => {
    const parsed = listSavedCompaniesQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 10)
})

test("listSavedCompaniesQuerySchema coerces string page/limit", () => {
    const parsed = listSavedCompaniesQuerySchema.parse({ page: "2", limit: "25" })
    assert.equal(parsed.page, 2)
    assert.equal(parsed.limit, 25)
})

test("listSavedCompaniesQuerySchema rejects limit > 50", () => {
    assert.throws(() => listSavedCompaniesQuerySchema.parse({ limit: 999 }))
})

test("listSavedCompaniesQuerySchema rejects page = 0", () => {
    assert.throws(() => listSavedCompaniesQuerySchema.parse({ page: 0 }))
})
