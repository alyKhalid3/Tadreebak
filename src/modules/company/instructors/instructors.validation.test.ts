// Phase 18B / Instructor invite validation tests.
//
// Pure Zod-schema tests — no DB. We assert the wire shape only;
// service-layer behaviour (DB lookups, email send, cache bust) is
// covered by the integration tests in a follow-up phase.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    acceptInstructorInviteSchema,
    confirmInstructorInviteSchema,
    inviteInstructorSchema,
    listInstructorsQuerySchema,
    updateInstructorSchema,
} from "./instructors.validation"

const VALID_OBJECT_ID = "6ab1d2e3f4a5b6c7d8e9f0a1"
const validInvite = {
    firstName: "Layla",
    lastName: "Hassan",
    email: "layla@example.com",
    roleId: VALID_OBJECT_ID,
    note: "You'll be mentoring the Q3 cohort.",
}

// ---- inviteInstructorSchema ----

test("inviteInstructorSchema: accepts a valid body", () => {
    const parsed = inviteInstructorSchema.parse(validInvite)
    assert.equal(parsed.firstName, "Layla")
    assert.equal(parsed.lastName, "Hassan")
    assert.equal(parsed.email, "layla@example.com")
})

test("inviteInstructorSchema: trims whitespace", () => {
    const parsed = inviteInstructorSchema.parse({
        ...validInvite,
        firstName: "  Layla  ",
        email: "  layla@example.com  ",
    })
    assert.equal(parsed.firstName, "Layla")
    assert.equal(parsed.email, "layla@example.com")
})

test("inviteInstructorSchema: rejects a too-short first name", () => {
    assert.throws(() => inviteInstructorSchema.parse({ ...validInvite, firstName: "L" }))
})

test("inviteInstructorSchema: rejects a too-long last name", () => {
    assert.throws(() =>
        inviteInstructorSchema.parse({ ...validInvite, lastName: "x".repeat(51) }),
    )
})

test("inviteInstructorSchema: rejects a bad email", () => {
    assert.throws(() =>
        inviteInstructorSchema.parse({ ...validInvite, email: "not-an-email" }),
    )
})

test("inviteInstructorSchema: rejects a > 500-char note", () => {
    assert.throws(() =>
        inviteInstructorSchema.parse({ ...validInvite, note: "x".repeat(501) }),
    )
})

test("inviteInstructorSchema: accepts a missing note (optional)", () => {
    const parsed = inviteInstructorSchema.parse({
        firstName: "Layla",
        lastName: "Hassan",
        email: "layla@example.com",
        roleId: VALID_OBJECT_ID,
    })
    assert.equal(parsed.note, undefined)
})

test("inviteInstructorSchema: rejects a missing roleId", () => {
    assert.throws(() => inviteInstructorSchema.parse({
        firstName: "Layla",
        lastName: "Hassan",
        email: "layla@example.com",
    }))
})

test("inviteInstructorSchema: rejects a non-ObjectId roleId", () => {
    assert.throws(() => inviteInstructorSchema.parse({
        ...validInvite,
        roleId: "not-an-objectid",
    }))
})

// ---- updateInstructorSchema ----

test("updateInstructorSchema: accepts an empty body", () => {
    // PATCH is partial — empty body is a valid "do nothing" no-op.
    const parsed = updateInstructorSchema.parse({})
    assert.deepEqual(parsed, {})
})

test("updateInstructorSchema: rejects firstName shorter than 2 chars", () => {
    assert.throws(() => updateInstructorSchema.parse({ firstName: "L" }))
})

// ---- listInstructorsQuerySchema ----

test("listInstructorsQuerySchema: defaults status to active", () => {
    const parsed = listInstructorsQuerySchema.parse({})
    assert.equal(parsed.status, "active")
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
})

test("listInstructorsQuerySchema: coerces page/limit from strings", () => {
    const parsed = listInstructorsQuerySchema.parse({
        page: "3",
        limit: "50",
        status: "removed",
    })
    assert.equal(parsed.page, 3)
    assert.equal(parsed.limit, 50)
    assert.equal(parsed.status, "removed")
})

test("listInstructorsQuerySchema: rejects limit > 100", () => {
    assert.throws(() => listInstructorsQuerySchema.parse({ limit: 101 }))
})

test("listInstructorsQuerySchema: rejects unknown status", () => {
    assert.throws(() => listInstructorsQuerySchema.parse({ status: "archived" }))
})

// ---- acceptInstructorInviteSchema ----

test("acceptInstructorInviteSchema: accepts a valid body", () => {
    const parsed = acceptInstructorInviteSchema.parse({
        inviteId: "6ab1d2e3f4a5b6c7d8e9f0a1",
        token: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        newPassword: "StrongP4ss!",
    })
    assert.equal(parsed.inviteId, "6ab1d2e3f4a5b6c7d8e9f0a1")
    assert.equal(parsed.token.length, 48)
    assert.equal(parsed.newPassword, "StrongP4ss!")
})

test("acceptInstructorInviteSchema: rejects a non-ObjectId inviteId", () => {
    assert.throws(() =>
        acceptInstructorInviteSchema.parse({
            inviteId: "not-an-objectid",
            token: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
            newPassword: "StrongP4ss!",
        }),
    )
})

test("acceptInstructorInviteSchema: rejects a too-short token", () => {
    assert.throws(() =>
        acceptInstructorInviteSchema.parse({
            inviteId: "6ab1d2e3f4a5b6c7d8e9f0a1",
            token: "short",
            newPassword: "StrongP4ss!",
        }),
    )
})

test("acceptInstructorInviteSchema: rejects a short password", () => {
    assert.throws(() =>
        acceptInstructorInviteSchema.parse({
            inviteId: "6ab1d2e3f4a5b6c7d8e9f0a1",
            token: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
            newPassword: "short",
        }),
    )
})

test("acceptInstructorInviteSchema: accepts optional name fields", () => {
    const parsed = acceptInstructorInviteSchema.parse({
        inviteId: "6ab1d2e3f4a5b6c7d8e9f0a1",
        token: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        newPassword: "StrongP4ss!",
        firstName: "Layla",
        lastName: "Hassan",
    })
    assert.equal(parsed.firstName, "Layla")
    assert.equal(parsed.lastName, "Hassan")
})

// ---- confirmInstructorInviteSchema (Phase 18B two-step accept) ----

test("confirmInstructorInviteSchema: accepts a valid body", () => {
    const parsed = confirmInstructorInviteSchema.parse({
        inviteId: "6ab1d2e3f4a5b6c7d8e9f0a1",
        token: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    })
    assert.equal(parsed.inviteId, "6ab1d2e3f4a5b6c7d8e9f0a1")
})

test("confirmInstructorInviteSchema: rejects a non-ObjectId inviteId", () => {
    assert.throws(() =>
        confirmInstructorInviteSchema.parse({
            inviteId: "not-an-objectid",
            token: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        }),
    )
})

test("confirmInstructorInviteSchema: rejects a too-short token", () => {
    assert.throws(() =>
        confirmInstructorInviteSchema.parse({
            inviteId: "6ab1d2e3f4a5b6c7d8e9f0a1",
            token: "short",
        }),
    )
})