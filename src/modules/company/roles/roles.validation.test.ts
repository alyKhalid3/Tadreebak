// Phase 18B / Roles validation tests.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    createRoleSchema,
    listRolesQuerySchema,
    updateRoleSchema,
} from "./roles.validation"

const VALID_OBJECT_ID = "6ab1d2e3f4a5b6c7d8e9f0a1"

test("createRoleSchema: accepts a valid body", () => {
    const parsed = createRoleSchema.parse({
        name: "Marketing Lead",
        description: "Reads applicants, can't create tasks",
        permissions: ["applicants.read", "interns.read", "attendance.read"],
    })
    assert.equal(parsed.name, "Marketing Lead")
    assert.equal(parsed.permissions.length, 3)
})

test("createRoleSchema: trims whitespace", () => {
    const parsed = createRoleSchema.parse({
        name: "  Marketing Lead  ",
        permissions: ["applicants.read"],
    })
    assert.equal(parsed.name, "Marketing Lead")
})

test("createRoleSchema: rejects a too-short name", () => {
    assert.throws(() => createRoleSchema.parse({
        name: "M",
        permissions: ["applicants.read"],
    }))
})

test("createRoleSchema: rejects an empty permissions array", () => {
    assert.throws(() => createRoleSchema.parse({
        name: "Empty",
        permissions: [],
    }))
})

test("createRoleSchema: rejects an unknown permission key", () => {
    assert.throws(() => createRoleSchema.parse({
        name: "Unicorn",
        permissions: ["unicorn.ride"],
    }))
})

test("createRoleSchema: rejects a mix of valid + invalid permissions", () => {
    assert.throws(() => createRoleSchema.parse({
        name: "Mixed",
        permissions: ["applicants.read", "unicorn.ride"],
    }))
})

test("updateRoleSchema: accepts an empty body (no-op)", () => {
    // PATCH partial — an empty body is a valid "no-op".
    const parsed = updateRoleSchema.parse({})
    assert.deepEqual(parsed, {})
})

test("updateRoleSchema: accepts a name-only body", () => {
    const parsed = updateRoleSchema.parse({ name: "Renamed" })
    assert.equal(parsed.name, "Renamed")
})

test("updateRoleSchema: accepts a permissions-only body", () => {
    const parsed = updateRoleSchema.parse({ permissions: ["applicants.read", "applicants.review"] })
    assert.equal(parsed.permissions?.length, 2)
})

test("updateRoleSchema: rejects an unknown permission key", () => {
    assert.throws(() => updateRoleSchema.parse({
        permissions: ["unicorn.ride"],
    }))
})

test("listRolesQuerySchema: defaults includeSystem to true", () => {
    const parsed = listRolesQuerySchema.parse({})
    assert.equal(parsed.includeSystem, true)
})

test("listRolesQuerySchema: coerces includeSystem from string", () => {
    const parsed = listRolesQuerySchema.parse({ includeSystem: "false" })
    assert.equal(parsed.includeSystem, false)
})