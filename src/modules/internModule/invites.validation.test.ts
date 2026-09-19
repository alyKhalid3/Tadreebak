import { test } from "node:test";
import assert from "node:assert/strict";
import {
    createInviteSchema,
    internIdParamSchema,
    inviteIdParamSchema,
    listInvitesQuerySchema,
} from "./invites.validation";

// ---------------------------------------------------------------------------
// createInviteSchema
// ---------------------------------------------------------------------------

test("createInviteSchema accepts a studentId-only body", () => {
    const parsed = createInviteSchema.parse({
        studentId: "6ab1d2e3f4a5b6c7d8e9f0a1",
    })
    assert.equal(parsed.studentId, "6ab1d2e3f4a5b6c7d8e9f0a1")
    assert.equal(parsed.note, undefined)
})

test("createInviteSchema accepts a studentId + note", () => {
    const parsed = createInviteSchema.parse({
        studentId: "6ab1d2e3f4a5b6c7d8e9f0a1",
        note: "We'd love your React skills.",
    })
    assert.equal(parsed.note, "We'd love your React skills.")
})

test("createInviteSchema rejects a missing studentId", () => {
    assert.throws(() => createInviteSchema.parse({}))
})

test("createInviteSchema rejects a bad studentId", () => {
    assert.throws(() =>
        createInviteSchema.parse({ studentId: "not-an-objectid" }),
    )
})

test("createInviteSchema rejects an empty note", () => {
    assert.throws(() =>
        createInviteSchema.parse({
            studentId: "6ab1d2e3f4a5b6c7d8e9f0a1",
            note: "",
        }),
    )
})

test("createInviteSchema rejects a > 500-char note", () => {
    assert.throws(() =>
        createInviteSchema.parse({
            studentId: "6ab1d2e3f4a5b6c7d8e9f0a1",
            note: "x".repeat(501),
        }),
    )
})

test("createInviteSchema trims the note", () => {
    const parsed = createInviteSchema.parse({
        studentId: "6ab1d2e3f4a5b6c7d8e9f0a1",
        note: "   please apply   ",
    })
    assert.equal(parsed.note, "please apply")
})

// ---------------------------------------------------------------------------
// internIdParamSchema / inviteIdParamSchema
// ---------------------------------------------------------------------------

test("internIdParamSchema accepts a valid internId", () => {
    const id = "6ab1d2e3f4a5b6c7d8e9f0a1"
    const parsed = internIdParamSchema.parse({ internId: id })
    assert.equal(parsed.internId, id)
})

test("internIdParamSchema rejects a bad internId", () => {
    assert.throws(() => internIdParamSchema.parse({ internId: "nope" }))
})

test("inviteIdParamSchema accepts both ids", () => {
    const parsed = inviteIdParamSchema.parse({
        internId: "6ab1d2e3f4a5b6c7d8e9f0a1",
        inviteId: "6ab1d2e3f4a5b6c7d8e9f0a2",
    })
    assert.equal(parsed.internId, "6ab1d2e3f4a5b6c7d8e9f0a1")
    assert.equal(parsed.inviteId, "6ab1d2e3f4a5b6c7d8e9f0a2")
})

test("inviteIdParamSchema rejects a bad inviteId", () => {
    assert.throws(() =>
        inviteIdParamSchema.parse({
            internId: "6ab1d2e3f4a5b6c7d8e9f0a1",
            inviteId: "nope",
        }),
    )
})

// ---------------------------------------------------------------------------
// listInvitesQuerySchema
// ---------------------------------------------------------------------------

test("listInvitesQuerySchema defaults page=1, limit=20", () => {
    const parsed = listInvitesQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
})

test("listInvitesQuerySchema coerces string page/limit", () => {
    const parsed = listInvitesQuerySchema.parse({ page: "3", limit: "50" })
    assert.equal(parsed.page, 3)
    assert.equal(parsed.limit, 50)
})

test("listInvitesQuerySchema accepts every status enum value", () => {
    for (const status of ["pending", "accepted", "declined", "revoked"]) {
        const parsed = listInvitesQuerySchema.parse({ status })
        assert.equal(parsed.status, status)
    }
})

test("listInvitesQuerySchema rejects an unknown status", () => {
    assert.throws(() => listInvitesQuerySchema.parse({ status: "expired" }))
})

test("listInvitesQuerySchema rejects limit > 100", () => {
    assert.throws(() => listInvitesQuerySchema.parse({ limit: 999 }))
})
