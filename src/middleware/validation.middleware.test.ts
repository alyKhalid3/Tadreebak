// Unit tests for the validation middleware (the `source: "body"|"query"|"params"|"merged"` API).
//
// This is a non-trivial middleware — it picks the right slice of the
// request, runs zod, then writes the sanitized result back to the
// matching field. Each branch has subtle behavior that the controller
// layer depends on (e.g. controllers read req.query after middleware
// runs). These tests pin those contracts.

import { test } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"
import { validation } from "./validation.middleware"
import { ValidationError } from "../utils/error"

// Minimal req/res shim. The middleware only reads req.body / req.query
// / req.params and writes the sanitized version back.
const fakeReq = (body: any = {}, query: any = {}, params: any = {}) => {
    const r: any = { body, query, params }
    // `query` is a getter on Express 5 — mirror that so Object.defineProperty
    // (used by the middleware to overwrite) is the only way to set it.
    Object.defineProperty(r, "query", {
        value: query,
        writable: true,
        configurable: true,
        enumerable: true,
    })
    return r
}

const callMiddleware = (
    schema: z.ZodType<any>,
    source: "body" | "query" | "params" | "merged" | undefined,
    req: any,
) => {
    const args: any[] = [schema]
    if (source !== undefined) args.push(source)
    const middleware = (validation as any)(...args)
    let nextErr: any = undefined
    let nextCalled = false
    // The middleware throws synchronously on validation failure.
    // In Express, the framework catches that and calls next(err);
    // in our test we have to do the catch ourselves.
    try {
        middleware(req, {} as any, ((err?: any) => {
            nextCalled = true
            nextErr = err
        }) as any)
    } catch (err) {
        nextErr = err
    }
    return { nextCalled, nextErr }
}

// ----- default source = "merged" -----
test("default source validates body+query+params together", () => {
    const schema = z.object({ name: z.string(), id: z.string() })
    const req = fakeReq({ name: "from-body" }, {}, { id: "from-params" })
    const { nextCalled, nextErr } = callMiddleware(schema, undefined, req)
    assert.equal(nextCalled, true)
    assert.equal(nextErr, undefined)
    // The middleware splits the sanitized data back: query-known
    // keys go to req.query, the rest go to req.body. "id" came from
    // params (not from query), so it lands on body — that's the
    // current split behavior.
    assert.equal(req.body.name, "from-body")
    assert.equal(req.body.id, "from-params")
})

test("merged source routes query-known keys to req.query", () => {
    const schema = z.object({ page: z.coerce.number().int().default(1), name: z.string() })
    // "page" is in original req.query, "name" is in req.body.
    const req = fakeReq({ name: "x" }, { page: "5" }, {})
    const { nextCalled } = callMiddleware(schema, "merged", req)
    assert.equal(nextCalled, true)
    assert.equal(req.query.page, 5, "page came from query → stays in query")
    assert.equal(req.body.name, "x", "name came from body → stays in body")
})

test("merged source also accepts req.file as legalAttachment", () => {
    const schema = z.object({ name: z.string(), legalAttachment: z.any().optional() })
    const req = fakeReq({ name: "x" }, {}, {})
    ;(req as any).file = { public_id: "abc", secure_url: "https://x" }
    const { nextCalled } = callMiddleware(schema, "merged", req)
    assert.equal(nextCalled, true)
    // legalAttachment is stripped from the output (the middleware
    // destructures it out before re-assigning). The file is
    // still on req.file for the controller to read.
    assert.equal(req.file.public_id, "abc")
    assert.equal(req.body.legalAttachment, undefined)
})

// ----- source: "body" -----
test("source: body validates only req.body, ignores query/params", () => {
    const schema = z.object({ name: z.string() })
    // If source: body were ignored, the schema would see "name" from
    // the query and pass. We want the middleware to fail because the
    // body lacks it.
    const req = fakeReq({}, { name: "from-query" }, {})
    const { nextErr } = callMiddleware(schema, "body", req)
    assert.ok(nextErr, "should have thrown an error")
    // The error must carry a 422 (validation) status code. Checking
    // the status code is more robust than `instanceof` across module
    // identity quirks in the test runner.
    assert.equal((nextErr as any).statusCode, 422, "should be a validation error (422)")
    assert.match(nextErr.message, /name=>/)
})

test("source: body leaves req.query untouched", () => {
    const schema = z.object({ name: z.string() })
    const req = fakeReq({ name: "ok" }, { other: "stays" }, {})
    const { nextCalled } = callMiddleware(schema, "body", req)
    assert.equal(nextCalled, true)
    // The schema only wrote to req.body; req.query is unchanged.
    assert.deepEqual(req.query, { other: "stays" })
})

// ----- source: "query" -----
test("source: query validates only req.query", () => {
    // Schema has a default so the empty query still passes — the
    // point of this test is that the body is invisible to source: query.
    const schema = z.object({ page: z.coerce.number().int().min(1).default(1) })
    const req = fakeReq({ page: "not-a-number" }, {}, {})
    // body has a page key, but source: query should ignore it. Without
    // source: query, the schema would coerce "not-a-number" and fail.
    // With source: query, the body is invisible — empty query, nothing
    // to validate, the default kicks in.
    const { nextCalled } = callMiddleware(schema, "query", req)
    assert.equal(nextCalled, true)
    // The body should be untouched (the page value is still there).
    assert.equal(req.body.page, "not-a-number")
})

test("source: query writes the sanitized result back to req.query", () => {
    const schema = z.object({ page: z.coerce.number().int().min(1).default(1) })
    const req = fakeReq({}, { page: "3" }, {})
    const { nextCalled } = callMiddleware(schema, "query", req)
    assert.equal(nextCalled, true)
    assert.equal(req.query.page, 3)
})

// ----- source: "params" -----
test("source: params validates only req.params", () => {
    const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id")
    const schema = z.object({ taskId: objectId })
    const req = fakeReq({}, {}, { taskId: "not-an-id" })
    const { nextErr } = callMiddleware(schema, "params", req)
    assert.ok(nextErr, "should have thrown an error")
    assert.equal((nextErr as any).statusCode, 422, "should be a validation error (422)")
    assert.match(nextErr.message, /Invalid id/i)
})

test("source: params leaves req.body and req.query untouched", () => {
    const objectId = z.string().regex(/^[a-f0-9]{24}$/i)
    const schema = z.object({ taskId: objectId })
    const goodOid = "6ab1c2d3e4f5a6b7c8d9e0f1"
    const req = fakeReq({ bodyKey: "stays" }, { queryKey: "stays" }, { taskId: goodOid })
    const { nextCalled } = callMiddleware(schema, "params", req)
    assert.equal(nextCalled, true)
    assert.equal(req.body.bodyKey, "stays")
    assert.equal(req.query.queryKey, "stays")
    assert.equal(req.params.taskId, goodOid)
})

// ----- error formatting -----
test("validation errors are joined with `,` and path-keyed", () => {
    const schema = z.object({ a: z.string().min(2), b: z.coerce.number().int() })
    const req = fakeReq({ a: "x", b: "nope" }, {}, {})
    const { nextErr } = callMiddleware(schema, "body", req)
    assert.ok(nextErr, "should have thrown an error")
    // The error message includes both field names so the frontend can
    // show per-field errors. Comma-joined for backwards compat with
    // the original middleware.
    assert.match(nextErr.message, /a=>/)
    assert.match(nextErr.message, /b=>/)
    assert.match(nextErr.message, /,/)
})

// ----- req.body / req.query missing defensively -----
test("handles missing req.body gracefully (treats as {})", () => {
    const schema = z.object({ name: z.string() })
    const req: any = { query: {}, params: {} }
    // No body. The middleware defaults it to {}. The schema will
    // throw ValidationError because name is required.
    const { nextErr } = callMiddleware(schema, "body", req)
    assert.ok(nextErr, "should have thrown an error")
    assert.equal((nextErr as any).statusCode, 422)
})

test("handles missing req.query gracefully (treats as {})", () => {
    const schema = z.object({ page: z.coerce.number() })
    const req: any = { body: {}, params: {} }
    // No query. Should still parse (page is optional via .default).
    // Use a schema where the field is required to force an error.
    const strict = z.object({ page: z.coerce.number() })
    const { nextErr } = callMiddleware(strict, "query", req)
    assert.ok(nextErr, "should have thrown an error")
    assert.equal((nextErr as any).statusCode, 422)
})
