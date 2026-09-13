// Tests for the priority-rank helpers.
//
// The rank table is the single source of truth for the kanban
// ordering. It must agree between the in-memory helper (used by the
// validation tests / any client-side sort) and the MongoDB
// $addFields stage (used by the aggregation pipeline). These tests
// pin the contract.

import { test } from "node:test"
import assert from "node:assert/strict"
import { PRIORITY_RANK, priorityRank, prioritySwitchBranches } from "./taskPriority"
import { TaskPriority } from "../DB/types/task.type"

test("PRIORITY_RANK assigns high < medium < low", () => {
    assert.ok(PRIORITY_RANK[TaskPriority.HIGH] < PRIORITY_RANK[TaskPriority.MEDIUM])
    assert.ok(PRIORITY_RANK[TaskPriority.MEDIUM] < PRIORITY_RANK[TaskPriority.LOW])
})

test("priorityRank(high) === 0", () => {
    assert.equal(priorityRank(TaskPriority.HIGH), 0)
})
test("priorityRank(medium) === 1", () => {
    assert.equal(priorityRank(TaskPriority.MEDIUM), 1)
})
test("priorityRank(low) === 2", () => {
    assert.equal(priorityRank(TaskPriority.LOW), 2)
})

test("priorityRank(undefined) returns the fallback (9) so unknown values sort last", () => {
    assert.equal(priorityRank(undefined), 9)
})
test("priorityRank(null) returns the fallback", () => {
    assert.equal(priorityRank(null), 9)
})
test("priorityRank('garbage') returns the fallback", () => {
    assert.equal(priorityRank("garbage"), 9)
})

test("prioritySwitchBranches returns 3 branches, one per priority, with the right rank", () => {
    const branches = prioritySwitchBranches()
    assert.equal(branches.length, 3)
    for (const branch of branches) {
        assert.ok(branch.case)
        assert.equal(typeof branch.then, "number")
    }
    // Verify each priority maps to its rank
    const byRank = new Map<number, string>()
    for (const branch of branches) {
        const eq = branch.case.$eq as string[]
        const priorityValue = eq[1] as string
        byRank.set(branch.then, priorityValue)
    }
    assert.equal(byRank.get(0), "high")
    assert.equal(byRank.get(1), "medium")
    assert.equal(byRank.get(2), "low")
})
