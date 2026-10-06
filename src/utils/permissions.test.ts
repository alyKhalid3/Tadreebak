// Phase 18B / Permission registry tests.
//
// Pure unit tests — no DB. The PERMISSIONS map + the picker
// helper are the source of truth for "what's possible", so
// any future change here is a deliberate scope expansion.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    PERMISSIONS,
    getAllPermissionKeys,
    isKnownPermission,
    listPermissionsForPicker,
} from "./permissions"

test("PERMISSIONS: contains every documented permission", () => {
    // Belt-and-braces: the schema and the docs share this set. If
    // someone removes a key from PERMISSIONS, they should also remove
    // it from the docs (PHASE_18B_PERMISSIONS_AND_ROLES_PLAN.md) and
    // update any in-DB role that still references it.
    const expected = [
        'tasks.read', 'tasks.create', 'tasks.update', 'tasks.delete', 'tasks.archive',
        'attendance.read', 'attendance.mark', 'attendance.schedule',
        'evaluations.read', 'evaluations.create', 'evaluations.share',
        'applicants.read', 'applicants.review', 'applicants.send_acceptance_email', 'applicants.mark_completed',
        'interns.read',
        'projects.read', 'projects.crud',
        'roles.read', 'roles.create', 'roles.update', 'roles.delete',
        'staff.invite', 'staff.update', 'staff.remove', 'staff.resend_invite',
    ]
    for (const key of expected) {
        assert.ok(key in PERMISSIONS, `missing ${key}`)
    }
})

test("PERMISSIONS: every value is a non-empty human-readable label", () => {
    for (const [key, label] of Object.entries(PERMISSIONS)) {
        assert.ok(typeof label === 'string' && label.length > 0, `${key} has empty label`)
        // Labels should not contain the key verbatim — the front-end
        // shows them as human text.
        assert.ok(!label.includes(key), `${key} label duplicates the key`)
    }
})

test("isKnownPermission: true for keys in the registry", () => {
    assert.ok(isKnownPermission('tasks.create'))
    assert.ok(isKnownPermission('applicants.review'))
    assert.ok(isKnownPermission('staff.invite'))
})

test("isKnownPermission: false for unknown keys", () => {
    assert.equal(isKnownPermission('unicorn.ride'), false)
    assert.equal(isKnownPermission(''), false)
    assert.equal(isKnownPermission('Tasks.Create'), false) // case-sensitive
})

test("getAllPermissionKeys: returns every key in the registry", () => {
    const keys = getAllPermissionKeys()
    assert.ok(keys.length > 0)
    for (const key of keys) {
        assert.ok(key in PERMISSIONS)
    }
})

test("listPermissionsForPicker: groups permissions by domain", () => {
    const picker = listPermissionsForPicker()
    assert.ok(picker.length > 0)
    // Each entry has key / label / group
    for (const entry of picker) {
        assert.ok(typeof entry.key === 'string')
        assert.ok(typeof entry.label === 'string')
        assert.ok(typeof entry.group === 'string')
        assert.ok(entry.label.length > 0)
        assert.ok(entry.group.length > 0)
    }
    // Every task.* lands in the Tasks group
    const taskEntries = picker.filter((e) => e.key.startsWith('tasks.'))
    assert.ok(taskEntries.every((e) => e.group === 'Tasks'))
    // Every staff.* lands in the "Staff (admin)" group
    const staffEntries = picker.filter((e) => e.key.startsWith('staff.'))
    assert.ok(staffEntries.every((e) => e.group === 'Staff (admin)'))
})