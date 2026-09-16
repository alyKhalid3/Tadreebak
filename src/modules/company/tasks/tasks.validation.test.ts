// Unit tests for the Tasks validation schemas (Phase 6 — broadcast).
//
// `createTaskSchema` is a discriminated union on the `target` field:
//   - target: "company" → fan out to every active intern at this company
//   - target: "program" → fan out to every intern in `programId`
//   - target: "project" → fan out to every intern in `projectId`
//   - target: "intern"  → single recipient (`internId` required)
//
// `bulkUpdateTaskSchema` covers the PATCH /group/:groupId endpoint.
// `taskGroupIdParamSchema` validates the `:groupId` path param.
// `listTasksQuerySchema` now also accepts `taskGroupId` as a filter.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    createTaskSchema,
    updateTaskSchema,
    listTasksQuerySchema,
    listBroadcastsQuerySchema,
    taskIdParamSchema,
    taskGroupIdParamSchema,
    bulkUpdateTaskSchema,
    transitionTaskSchema,
    feedbackTaskSchema,
    submitTaskSchema,
} from "./tasks.validation"
import { TaskPriority, TaskStatus } from "../../../DB/types/task.type"

const VALID_OID = "6ab1c2d3e4f5a6b7c8d9e0f1"
const VALID_OID_2 = "6ab1c2d3e4f5a6b7c8d9e0f2"

// ============================================================
// createTaskSchema — the 4 target modes
// ============================================================

// ----- target: 'company' (whole-intern broadcast) -----
test("createTaskSchema accepts a minimal 'company' broadcast (no internId, no programId, no projectId)", () => {
    const parsed = createTaskSchema.parse({
        target: "company",
        title: "Read the handbook",
        description: "Cover sections 1-3",
        dueDate: "2026-12-31T23:59:59.000Z",
    })
    assert.equal(parsed.target, "company")
    assert.equal(parsed.priority, TaskPriority.MEDIUM)
    assert.deepEqual(parsed.tags, [])
})

test("createTaskSchema accepts a 'company' broadcast with optional projectId/programId context", () => {
    const parsed = createTaskSchema.parse({
        target: "company",
        title: "AA",
        description: "x",
        dueDate: "2026-12-31",
        projectId: VALID_OID,
        programId: VALID_OID_2,
    })
    assert.equal(parsed.projectId, VALID_OID)
    assert.equal(parsed.programId, VALID_OID_2)
})

test("createTaskSchema silently strips 'company' branch's accidental internId (Zod default is strip, not strict)", () => {
    // By default Zod object schemas strip unknown keys, so an extra
    // `internId` on a `target: "company"` body is dropped and the
    // parse succeeds. The intern target is still reached explicitly
    // by `target: "intern"`. This test pins that behavior so we'd
    // notice if we ever turned on `strict()` and broke the wire format.
    const parsed = createTaskSchema.parse({
        target: "company",
        internId: VALID_OID,
        title: "AA",
        description: "x",
        dueDate: "2026-12-31",
    })
    assert.equal(parsed.target, "company")
})

// ----- target: 'program' -----
test("createTaskSchema accepts a 'program' broadcast with programId", () => {
    const parsed = createTaskSchema.parse({
        target: "program",
        programId: VALID_OID,
        title: "AA",
        description: "x",
        dueDate: "2026-12-31",
    })
    assert.equal(parsed.target, "program")
    assert.equal(parsed.programId, VALID_OID)
})

test("createTaskSchema rejects a 'program' broadcast without programId", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "program",
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
            }),
        /programId|Required|Invalid/i,
    )
})

// ----- target: 'project' -----
test("createTaskSchema accepts a 'project' broadcast with projectId", () => {
    const parsed = createTaskSchema.parse({
        target: "project",
        projectId: VALID_OID,
        title: "AA",
        description: "x",
        dueDate: "2026-12-31",
    })
    assert.equal(parsed.target, "project")
    assert.equal(parsed.projectId, VALID_OID)
})

test("createTaskSchema rejects a 'project' broadcast without projectId", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "project",
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
            }),
        /projectId|Required|Invalid/i,
    )
})

// ----- target: 'intern' (the legacy single-recipient shape) -----
test("createTaskSchema accepts a minimal 'intern' task (the legacy shape)", () => {
    const parsed = createTaskSchema.parse({
        target: "intern",
        internId: VALID_OID,
        title: "Build the login page",
        description: "Implement JWT auth on the dashboard login route",
        dueDate: "2026-12-31T23:59:59.000Z",
    })
    assert.equal(parsed.target, "intern")
    assert.equal(parsed.title, "Build the login page")
    // Narrow the union so the test can read internId (TS won't let
    // you access a discriminator-specific field without a guard).
    if (parsed.target === "intern") {
        assert.equal(parsed.internId, VALID_OID)
    }
    assert.equal(parsed.priority, TaskPriority.MEDIUM)
    assert.deepEqual(parsed.tags, [])
    assert.equal(parsed.attachments, undefined)
})

test("createTaskSchema rejects an 'intern' task without internId", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
            }),
        /internId|Required|Invalid/i,
    )
})

test("createTaskSchema rejects a malformed internId", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: "nope",
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
            }),
        /Invalid id/i,
    )
})

// ----- shared metadata (every mode) -----
test("createTaskSchema trims the title", () => {
    const parsed = createTaskSchema.parse({
        target: "intern",
        internId: VALID_OID,
        title: "  Padded  ",
        description: "x",
        dueDate: "2026-12-31",
    })
    assert.equal(parsed.title, "Padded")
})

test("createTaskSchema rejects a title shorter than 2 chars", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "A",
                description: "x",
                dueDate: "2026-12-31",
            }),
        /Too small/i,
    )
})

test("createTaskSchema rejects a title longer than 200 chars", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "x".repeat(201),
                description: "x",
                dueDate: "2026-12-31",
            }),
        /Too big/i,
    )
})

test("createTaskSchema rejects an empty description", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "AA",
                description: "",
                dueDate: "2026-12-31",
            }),
        /Too small/i,
    )
})

test("createTaskSchema rejects a description longer than 5000 chars", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "AA",
                description: "x".repeat(5001),
                dueDate: "2026-12-31",
            }),
        /Too big/i,
    )
})

test("createTaskSchema accepts every TaskPriority enum value", () => {
    for (const p of ["high", "medium", "low"] as const) {
        const parsed = createTaskSchema.parse({
            target: "intern",
            internId: VALID_OID,
            title: "AA",
            description: "x",
            dueDate: "2026-12-31",
            priority: p,
        })
        assert.equal(parsed.priority, p)
    }
})

test("createTaskSchema rejects an invalid priority", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
                priority: "urgent" as any,
            }),
        /Invalid option/i,
    )
})

test("createTaskSchema accepts up to 20 tags and trims them at parse time", () => {
    const parsed = createTaskSchema.parse({
        target: "intern",
        internId: VALID_OID,
        title: "AA",
        description: "x",
        dueDate: "2026-12-31",
        tags: ["  Backend  ", "frontend"],
    })
    assert.equal(parsed.tags[0], "Backend")
    assert.equal(parsed.tags[1], "frontend")
})

test("createTaskSchema rejects more than 20 tags", () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `tag${i}`)
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
                tags: tooMany,
            }),
        /Too big/i,
    )
})

test("createTaskSchema rejects a tag longer than 32 chars", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
                tags: ["x".repeat(33)],
            }),
        /Too big/i,
    )
})

test("createTaskSchema coerces dueDate from a string", () => {
    const parsed = createTaskSchema.parse({
        target: "intern",
        internId: VALID_OID,
        title: "AA",
        description: "x",
        dueDate: "2026-12-31",
    })
    assert.equal(parsed.dueDate instanceof Date, true)
})

test("createTaskSchema rejects an unparseable dueDate", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "AA",
                description: "x",
                dueDate: "not-a-date",
            }),
        /Invalid date/i,
    )
})

test("createTaskSchema accepts a valid attachment", () => {
    const parsed = createTaskSchema.parse({
        target: "intern",
        internId: VALID_OID,
        title: "AA",
        description: "x",
        dueDate: "2026-12-31",
        attachments: [
            {
                public_id: "abc",
                secure_url: "https://x.cloudinary.com/y.pdf",
                name: "spec.pdf",
                mimeType: "application/pdf",
                size: 1024,
            },
        ],
    })
    assert.equal(parsed.attachments?.length, 1)
})

test("createTaskSchema rejects an attachment over 10 MB", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
                attachments: [
                    {
                        public_id: "abc",
                        secure_url: "https://x.cloudinary.com/y.pdf",
                        name: "huge.pdf",
                        mimeType: "application/pdf",
                        size: 11 * 1024 * 1024,
                    },
                ],
            }),
        /Too big/i,
    )
})

test("createTaskSchema rejects more than 10 attachments", () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
        public_id: `p${i}`,
        secure_url: "https://x.cloudinary.com/y.pdf",
        name: `f${i}.pdf`,
        mimeType: "application/pdf",
        size: 100,
    }))
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "intern",
                internId: VALID_OID,
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
                attachments: tooMany,
            }),
        /Too big/i,
    )
})

// ----- discriminator enforces the right id for the right target -----
test("createTaskSchema rejects a 'company' body that has only programId (no target match)", () => {
    // target=company is valid, but if it has programId without
    // target=program, the schema still accepts it (programId is
    // optional context on the 'company' branch). The reverse:
    // target=program without programId is rejected.
    assert.throws(
        () =>
            createTaskSchema.parse({
                target: "program",
                projectId: VALID_OID,
                title: "AA",
                description: "x",
                dueDate: "2026-12-31",
            }),
        /programId|Required|Invalid/i,
    )
})

// ============================================================
// updateTaskSchema (single-task update — unchanged)
// ============================================================

test("updateTaskSchema makes every field optional", () => {
    const parsed = updateTaskSchema.parse({})
    assert.deepEqual(parsed, {})
})

test("updateTaskSchema accepts a partial update with a valid priority", () => {
    const parsed = updateTaskSchema.parse({ priority: "high" })
    assert.equal(parsed.priority, "high")
})

test("updateTaskSchema rejects an invalid priority", () => {
    assert.throws(() => updateTaskSchema.parse({ priority: "urgent" as any }), /Invalid option/i)
})

// ============================================================
// listTasksQuerySchema (added taskGroupId filter)
// ============================================================

test("listTasksQuerySchema applies defaults: sort=dueDate, page=1, limit=20", () => {
    const parsed = listTasksQuerySchema.parse({})
    assert.equal(parsed.sort, "dueDate")
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
})

test("listTasksQuerySchema coerces string page/limit (Express query strings)", () => {
    const parsed = listTasksQuerySchema.parse({ page: "3", limit: "50" })
    assert.equal(parsed.page, 3)
    assert.equal(parsed.limit, 50)
})

test("listTasksQuerySchema rejects limit > 100", () => {
    assert.throws(() => listTasksQuerySchema.parse({ limit: "500" }), /Too big/i)
})

test("listTasksQuerySchema accepts every sort value", () => {
    for (const s of ["recent", "dueDate", "priority", "title"] as const) {
        const parsed = listTasksQuerySchema.parse({ sort: s })
        assert.equal(parsed.sort, s)
    }
})

test("listTasksQuerySchema rejects an invalid sort", () => {
    assert.throws(() => listTasksQuerySchema.parse({ sort: "score" as any }), /Invalid option/i)
})

test("listTasksQuerySchema accepts optional internId/projectId/programId/taskGroupId filters", () => {
    const parsed = listTasksQuerySchema.parse({
        internId: VALID_OID,
        projectId: VALID_OID,
        programId: VALID_OID_2,
        taskGroupId: VALID_OID,
    })
    assert.equal(parsed.internId, VALID_OID)
    assert.equal(parsed.projectId, VALID_OID)
    assert.equal(parsed.programId, VALID_OID_2)
    assert.equal(parsed.taskGroupId, VALID_OID)
})

test("listTasksQuerySchema rejects a malformed internId filter", () => {
    assert.throws(() => listTasksQuerySchema.parse({ internId: "nope" }), /Invalid id/i)
})

test("listTasksQuerySchema rejects a malformed taskGroupId filter", () => {
    assert.throws(() => listTasksQuerySchema.parse({ taskGroupId: "nope" }), /Invalid id/i)
})

test("listTasksQuerySchema accepts a search string of exactly 100 chars", () => {
    const parsed = listTasksQuerySchema.parse({ search: "x".repeat(100) })
    assert.equal(parsed.search?.length, 100)
})

test("listTasksQuerySchema rejects a search string over 100 chars", () => {
    assert.throws(() => listTasksQuerySchema.parse({ search: "x".repeat(101) }), /Too big/i)
})

test("listTasksQuerySchema accepts each TaskStatus", () => {
    for (const s of ["todo", "in_progress", "in_review", "complete"] as const) {
        const parsed = listTasksQuerySchema.parse({ status: s })
        assert.equal(parsed.status, s)
    }
})

test("listTasksQuerySchema rejects an invalid status", () => {
    assert.throws(
        () => listTasksQuerySchema.parse({ status: "deleted" as any }),
        /Invalid option/i,
    )
})

// ============================================================
// taskIdParamSchema
// ============================================================

test("taskIdParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = taskIdParamSchema.parse({ taskId: VALID_OID })
    assert.equal(parsed.taskId, VALID_OID)
})

test("taskIdParamSchema rejects a malformed id", () => {
    assert.throws(() => taskIdParamSchema.parse({ taskId: "nope" }), /Invalid id/i)
})

// ============================================================
// taskGroupIdParamSchema (Phase 6 — broadcast routes)
// ============================================================

test("taskGroupIdParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = taskGroupIdParamSchema.parse({ groupId: VALID_OID })
    assert.equal(parsed.groupId, VALID_OID)
})

test("taskGroupIdParamSchema rejects a malformed groupId", () => {
    assert.throws(() => taskGroupIdParamSchema.parse({ groupId: "nope" }), /Invalid id/i)
})

// ============================================================
// bulkUpdateTaskSchema (Phase 6 — PATCH /group/:groupId)
// ============================================================

test("bulkUpdateTaskSchema accepts a single field update", () => {
    const parsed = bulkUpdateTaskSchema.parse({ dueDate: "2026-12-31" })
    assert.equal(parsed.dueDate instanceof Date, true)
})

test("bulkUpdateTaskSchema accepts a multi-field update including priority", () => {
    const parsed = bulkUpdateTaskSchema.parse({
        priority: "high",
        dueDate: "2026-12-31",
        tags: ["urgent", "all-hands"],
    })
    assert.equal(parsed.priority, "high")
    assert.equal(parsed.tags?.length, 2)
})

test("bulkUpdateTaskSchema rejects an empty patch (must include at least one field)", () => {
    assert.throws(() => bulkUpdateTaskSchema.parse({}), /At least one field/i)
})

test("bulkUpdateTaskSchema rejects an invalid priority", () => {
    assert.throws(
        () => bulkUpdateTaskSchema.parse({ priority: "urgent" as any }),
        /Invalid option/i,
    )
})

test("bulkUpdateTaskSchema rejects a title shorter than 2 chars", () => {
    assert.throws(() => bulkUpdateTaskSchema.parse({ title: "A" }), /Too small/i)
})

test("bulkUpdateTaskSchema rejects an unparseable dueDate", () => {
    assert.throws(() => bulkUpdateTaskSchema.parse({ dueDate: "nope" }), /Invalid date/i)
})

// ============================================================
// transitionTaskSchema / feedbackTaskSchema / submitTaskSchema (unchanged)
// ============================================================

test("transitionTaskSchema accepts every TaskStatus", () => {
    for (const s of Object.values(TaskStatus)) {
        const parsed = transitionTaskSchema.parse({ to: s })
        assert.equal(parsed.to, s)
    }
})

test("transitionTaskSchema accepts a numeric pointsAwarded", () => {
    const parsed = transitionTaskSchema.parse({ to: "complete", pointsAwarded: 20 })
    assert.equal(parsed.pointsAwarded, 20)
})

test("transitionTaskSchema rejects a negative pointsAwarded", () => {
    assert.throws(
        () => transitionTaskSchema.parse({ to: "complete", pointsAwarded: -5 }),
        /Too small/i,
    )
})

test("transitionTaskSchema rejects pointsAwarded over 10000", () => {
    assert.throws(
        () => transitionTaskSchema.parse({ to: "complete", pointsAwarded: 20000 }),
        /Too big/i,
    )
})

test("transitionTaskSchema rejects an empty reviewerFeedback", () => {
    assert.throws(
        () => transitionTaskSchema.parse({ to: "complete", reviewerFeedback: "" }),
        /Too small/i,
    )
})

test("transitionTaskSchema accepts a reviewerFeedback up to 2000 chars", () => {
    const parsed = transitionTaskSchema.parse({
        to: "complete",
        reviewerFeedback: "x".repeat(2000),
    })
    assert.equal(parsed.reviewerFeedback?.length, 2000)
})

test("transitionTaskSchema rejects a reviewerFeedback over 2000 chars", () => {
    assert.throws(
        () =>
            transitionTaskSchema.parse({
                to: "complete",
                reviewerFeedback: "x".repeat(2001),
            }),
        /Too big/i,
    )
})

test("feedbackTaskSchema requires a non-empty reviewerFeedback", () => {
    assert.throws(() => feedbackTaskSchema.parse({ reviewerFeedback: "" }), /Too small/i)
    const parsed = feedbackTaskSchema.parse({ reviewerFeedback: "Looks good" })
    assert.equal(parsed.reviewerFeedback, "Looks good")
})

test("submitTaskSchema accepts an empty body (no note)", () => {
    const parsed = submitTaskSchema.parse({})
    assert.equal(parsed.note, undefined)
})

test("submitTaskSchema accepts an optional note", () => {
    const parsed = submitTaskSchema.parse({ note: "Fixed the off-by-one" })
    assert.equal(parsed.note, "Fixed the off-by-one")
})

test("submitTaskSchema rejects a note over 2000 chars", () => {
    assert.throws(
        () => submitTaskSchema.parse({ note: "x".repeat(2001) }),
        /Too big/i,
    )
})

test("submitTaskSchema rejects an empty note (trimmed)", () => {
    assert.throws(() => submitTaskSchema.parse({ note: "   " }), /Too small/i)
})

// ============================================================
// listBroadcastsQuerySchema — Phase 6.5 aggregation endpoint
// ============================================================

test("listBroadcastsQuerySchema applies defaults (page=1, limit=20)", () => {
    const parsed = listBroadcastsQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
})

test("listBroadcastsQuerySchema accepts a memberId filter", () => {
    const parsed = listBroadcastsQuerySchema.parse({ memberId: VALID_OID })
    assert.equal(parsed.memberId, VALID_OID)
})

test("listBroadcastsQuerySchema accepts a projectId + programId + priority + status combo", () => {
    const parsed = listBroadcastsQuerySchema.parse({
        projectId: VALID_OID,
        programId: VALID_OID_2,
        priority: "high",
        status: "in_review",
    })
    assert.equal(parsed.projectId, VALID_OID)
    assert.equal(parsed.programId, VALID_OID_2)
    assert.equal(parsed.priority, "high")
    assert.equal(parsed.status, "in_review")
})

test("listBroadcastsQuerySchema rejects a malformed memberId", () => {
    assert.throws(
        () => listBroadcastsQuerySchema.parse({ memberId: "nope" }),
        /Invalid id/i,
    )
})

test("listBroadcastsQuerySchema rejects an invalid status enum", () => {
    assert.throws(
        () => listBroadcastsQuerySchema.parse({ status: "deleted" }),
        /Invalid option/i,
    )
})

test("listBroadcastsQuerySchema rejects an invalid priority enum", () => {
    assert.throws(
        () => listBroadcastsQuerySchema.parse({ priority: "critical" }),
        /Invalid option/i,
    )
})

test("listBroadcastsQuerySchema rejects limit > 100", () => {
    assert.throws(
        () => listBroadcastsQuerySchema.parse({ limit: "500" }),
        /Too big/i,
    )
})

test("listBroadcastsQuerySchema rejects a search string that's too short", () => {
    assert.throws(
        () => listBroadcastsQuerySchema.parse({ search: "" }),
        /Too small/i,
    )
})

test("listBroadcastsQuerySchema accepts a search string up to 100 chars", () => {
    const long = "x".repeat(100)
    const parsed = listBroadcastsQuerySchema.parse({ search: long })
    assert.equal(parsed.search, long)
})
