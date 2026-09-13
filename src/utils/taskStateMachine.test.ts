// Exhaustive tests for the task state machine.
//
// The state machine is the contract for the kanban. These tests pin
// down:
//   - every legal transition (positive cases)
//   - every illegal transition (negative cases) — including the
//     "shouldn't be possible but check anyway" cross-role cases
//   - the `nextStates()` helper used by the frontend to decide
//     which action buttons to render
//   - the `isTerminal()` helper
//
// If you change the table in src/utils/taskStateMachine.ts, these
// tests will fail loudly so you can confirm the new rules are
// intentional.

import { test } from "node:test"
import assert from "node:assert/strict"
import { canTransition, nextStates, isTerminal } from "./taskStateMachine"
import { TaskStatus } from "../DB/types/task.type"

// ----- Admin transitions -----
test("admin can transition todo → in_progress", () => {
    assert.equal(canTransition('admin', TaskStatus.TODO, TaskStatus.IN_PROGRESS), true)
})
test("admin can transition todo → complete (shortcut)", () => {
    assert.equal(canTransition('admin', TaskStatus.TODO, TaskStatus.COMPLETE), true)
})
test("admin can transition in_progress → in_review", () => {
    assert.equal(canTransition('admin', TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW), true)
})
test("admin can transition in_progress → complete (early approval)", () => {
    assert.equal(canTransition('admin', TaskStatus.IN_PROGRESS, TaskStatus.COMPLETE), true)
})
test("admin can transition in_review → in_progress (send back)", () => {
    assert.equal(canTransition('admin', TaskStatus.IN_REVIEW, TaskStatus.IN_PROGRESS), true)
})
test("admin can transition in_review → complete (approve)", () => {
    assert.equal(canTransition('admin', TaskStatus.IN_REVIEW, TaskStatus.COMPLETE), true)
})

// ----- Admin denials -----
test("admin cannot transition complete → anything", () => {
    for (const to of [
        TaskStatus.TODO,
        TaskStatus.IN_PROGRESS,
        TaskStatus.IN_REVIEW,
    ]) {
        assert.equal(canTransition('admin', TaskStatus.COMPLETE, to), false,
            `admin should not be able to move complete → ${to}`)
    }
})
test("admin cannot transition archived → anything (terminal)", () => {
    for (const to of Object.values(TaskStatus)) {
        assert.equal(canTransition('admin', TaskStatus.ARCHIVED, to), false,
            `admin should not be able to move archived → ${to}`)
    }
})
test("admin cannot skip in_progress (todo → in_review)", () => {
    assert.equal(canTransition('admin', TaskStatus.TODO, TaskStatus.IN_REVIEW), false)
})
test("admin cannot skip complete (todo → in_review is also not a thing)", () => {
    assert.equal(canTransition('admin', TaskStatus.TODO, TaskStatus.IN_REVIEW), false)
})
test("admin cannot move backwards (in_review → todo is not allowed)", () => {
    assert.equal(canTransition('admin', TaskStatus.IN_REVIEW, TaskStatus.TODO), false)
})
test("admin cannot move in_progress → todo", () => {
    assert.equal(canTransition('admin', TaskStatus.IN_PROGRESS, TaskStatus.TODO), false)
})

// ----- Intern transitions -----
test("intern can transition todo → in_progress (start)", () => {
    assert.equal(canTransition('intern', TaskStatus.TODO, TaskStatus.IN_PROGRESS), true)
})
test("intern can transition in_progress → in_review (submit)", () => {
    assert.equal(canTransition('intern', TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW), true)
})

// ----- Intern denials (the strict ones) -----
test("intern CANNOT transition todo → complete (no skipping review)", () => {
    // The admin can, but the intern must not. This is the most
    // important guard in the state machine: if it ever returns
    // true here, the intern can mark their own work approved.
    assert.equal(canTransition('intern', TaskStatus.TODO, TaskStatus.COMPLETE), false)
})
test("intern CANNOT transition in_review → complete (no self-approval)", () => {
    // The intern is not allowed to approve their own work, even
    // if the admin has put it in_review. They have to wait.
    assert.equal(canTransition('intern', TaskStatus.IN_REVIEW, TaskStatus.COMPLETE), false)
})
test("intern CANNOT transition in_review → in_progress (no self-send-back)", () => {
    // The "send back" transition is admin-only. The intern cannot
    // move a review back to in_progress on their own.
    assert.equal(canTransition('intern', TaskStatus.IN_REVIEW, TaskStatus.IN_PROGRESS), false)
})
test("intern CANNOT transition in_progress → complete (no self-approval)", () => {
    assert.equal(canTransition('intern', TaskStatus.IN_PROGRESS, TaskStatus.COMPLETE), false)
})
test("intern CANNOT transition in_progress → todo (no rewind)", () => {
    assert.equal(canTransition('intern', TaskStatus.IN_PROGRESS, TaskStatus.TODO), false)
})
test("intern CANNOT transition complete → anything", () => {
    for (const to of Object.values(TaskStatus)) {
        assert.equal(canTransition('intern', TaskStatus.COMPLETE, to), false)
    }
})
test("intern CANNOT transition archived → anything", () => {
    for (const to of Object.values(TaskStatus)) {
        assert.equal(canTransition('intern', TaskStatus.ARCHIVED, to), false)
    }
})

// ----- nextStates() — drives the frontend buttons -----
test("nextStates(admin, todo) includes in_progress and complete", () => {
    const next = nextStates('admin', TaskStatus.TODO)
    assert.deepEqual(next.sort(), [TaskStatus.COMPLETE, TaskStatus.IN_PROGRESS].sort())
})
test("nextStates(admin, in_progress) includes in_review and complete", () => {
    const next = nextStates('admin', TaskStatus.IN_PROGRESS)
    assert.deepEqual(next.sort(), [TaskStatus.COMPLETE, TaskStatus.IN_REVIEW].sort())
})
test("nextStates(admin, in_review) includes in_progress and complete", () => {
    const next = nextStates('admin', TaskStatus.IN_REVIEW)
    assert.deepEqual(next.sort(), [TaskStatus.COMPLETE, TaskStatus.IN_PROGRESS].sort())
})
test("nextStates(admin, complete) is empty (terminal)", () => {
    assert.deepEqual(nextStates('admin', TaskStatus.COMPLETE), [])
})
test("nextStates(admin, archived) is empty (terminal)", () => {
    assert.deepEqual(nextStates('admin', TaskStatus.ARCHIVED), [])
})
test("nextStates(intern, todo) is exactly [in_progress]", () => {
    assert.deepEqual(nextStates('intern', TaskStatus.TODO), [TaskStatus.IN_PROGRESS])
})
test("nextStates(intern, in_progress) is exactly [in_review]", () => {
    assert.deepEqual(nextStates('intern', TaskStatus.IN_PROGRESS), [TaskStatus.IN_REVIEW])
})
test("nextStates(intern, in_review) is empty — intern is stuck waiting for admin", () => {
    assert.deepEqual(nextStates('intern', TaskStatus.IN_REVIEW), [])
})
test("nextStates(intern, complete) is empty", () => {
    assert.deepEqual(nextStates('intern', TaskStatus.COMPLETE), [])
})

// ----- isTerminal() -----
test("isTerminal(complete) is true", () => {
    assert.equal(isTerminal(TaskStatus.COMPLETE), true)
})
test("isTerminal(archived) is true", () => {
    assert.equal(isTerminal(TaskStatus.ARCHIVED), true)
})
test("isTerminal(todo) is false", () => {
    assert.equal(isTerminal(TaskStatus.TODO), false)
})
test("isTerminal(in_progress) is false", () => {
    assert.equal(isTerminal(TaskStatus.IN_PROGRESS), false)
})
test("isTerminal(in_review) is false (admin can still move it)", () => {
    assert.equal(isTerminal(TaskStatus.IN_REVIEW), false)
})

// ----- Cross-role sanity: admin is a strict superset of intern -----
// For every from state, the intern's allowed targets are a subset of
// the admin's. This invariant must hold — if it doesn't, the
// intern's permissions are leaking or the admin's are regressing.
test("intern's allowed targets are always a subset of admin's", () => {
    for (const from of Object.values(TaskStatus)) {
        const adminNext = new Set(nextStates('admin', from))
        const internNext = nextStates('intern', from)
        for (const to of internNext) {
            assert.equal(
                adminNext.has(to),
                true,
                `intern can go ${from} → ${to} but admin cannot — invariant broken`,
            )
        }
    }
})
