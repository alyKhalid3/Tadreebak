// Unit tests for the Tasks validation schemas.
//
// These schemas are the contract the controller layer enforces. Pinning
// them with tests catches regressions like dropping the priority enum
// or letting unbounded attachments through. Pattern matches the
// programs/projects validation tests (Zod v4 error wording).
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    createTaskSchema,
    updateTaskSchema,
    listTasksQuerySchema,
    taskIdParamSchema,
    transitionTaskSchema,
    feedbackTaskSchema,
    submitTaskSchema,
} from "./tasks.validation"
import { TaskPriority, TaskStatus } from "../../../DB/types/task.type"

const VALID_OID = "6ab1c2d3e4f5a6b7c8d9e0f1"

test("createTaskSchema accepts a minimal valid task", () => {
    const parsed = createTaskSchema.parse({
        title: "Build the login page",
        description: "Implement JWT auth on the dashboard login route",
        internId: VALID_OID,
        dueDate: "2026-12-31T23:59:59.000Z",
    })
    assert.equal(parsed.title, "Build the login page")
    assert.equal(parsed.internId, VALID_OID)
    assert.equal(parsed.priority, TaskPriority.MEDIUM)
    assert.deepEqual(parsed.tags, [])
    assert.equal(parsed.attachments, undefined)
})

test("createTaskSchema trims the title", () => {
    const parsed = createTaskSchema.parse({
        title: "  Padded  ",
        description: "x",
        internId: VALID_OID,
        dueDate: "2026-12-31",
    })
    assert.equal(parsed.title, "Padded")
})

test("createTaskSchema rejects a title shorter than 2 chars", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                title: "A",
                description: "x",
                internId: VALID_OID,
                dueDate: "2026-12-31",
            }),
        /Too small/i,
    )
})

test("createTaskSchema rejects a title longer than 200 chars", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                title: "x".repeat(201),
                description: "x",
                internId: VALID_OID,
                dueDate: "2026-12-31",
            }),
        /Too big/i,
    )
})

test("createTaskSchema rejects an empty description", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                title: "AA",
                description: "",
                internId: VALID_OID,
                dueDate: "2026-12-31",
            }),
        /Too small/i,
    )
})

test("createTaskSchema rejects a description longer than 5000 chars", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                title: "AA",
                description: "x".repeat(5001),
                internId: VALID_OID,
                dueDate: "2026-12-31",
            }),
        /Too big/i,
    )
})

test("createTaskSchema rejects a malformed internId", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                title: "AA",
                description: "x",
                internId: "nope",
                dueDate: "2026-12-31",
            }),
        /Invalid id/i,
    )
})

test("createTaskSchema accepts every TaskPriority enum value", () => {
    for (const p of ["high", "medium", "low"] as const) {
        const parsed = createTaskSchema.parse({
            title: "AA",
            description: "x",
            internId: VALID_OID,
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
                title: "AA",
                description: "x",
                internId: VALID_OID,
                dueDate: "2026-12-31",
                priority: "urgent" as any,
            }),
        /Invalid option/i,
    )
})

test("createTaskSchema lowercases & trims tags at parse time", () => {
    // Trim happens via .trim() in the schema. Lowercasing happens in
    // the service layer — the schema only validates per-tag length.
    const parsed = createTaskSchema.parse({
        title: "AA",
        description: "x",
        internId: VALID_OID,
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
                title: "AA",
                description: "x",
                internId: VALID_OID,
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
                title: "AA",
                description: "x",
                internId: VALID_OID,
                dueDate: "2026-12-31",
                tags: ["x".repeat(33)],
            }),
        /Too big/i,
    )
})

test("createTaskSchema accepts an optional projectId when valid", () => {
    const parsed = createTaskSchema.parse({
        title: "AA",
        description: "x",
        internId: VALID_OID,
        projectId: VALID_OID,
        dueDate: "2026-12-31",
    })
    assert.equal(parsed.projectId, VALID_OID)
})

test("createTaskSchema rejects a malformed projectId", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                title: "AA",
                description: "x",
                internId: VALID_OID,
                projectId: "nope",
                dueDate: "2026-12-31",
            }),
        /Invalid id/i,
    )
})

test("createTaskSchema coerces dueDate from a string", () => {
    const parsed = createTaskSchema.parse({
        title: "AA",
        description: "x",
        internId: VALID_OID,
        dueDate: "2026-12-31",
    })
    assert.equal(parsed.dueDate instanceof Date, true)
})

test("createTaskSchema rejects an unparseable dueDate", () => {
    assert.throws(
        () =>
            createTaskSchema.parse({
                title: "AA",
                description: "x",
                internId: VALID_OID,
                dueDate: "not-a-date",
            }),
        /Invalid date/i,
    )
})

test("createTaskSchema accepts a valid attachment", () => {
    const parsed = createTaskSchema.parse({
        title: "AA",
        description: "x",
        internId: VALID_OID,
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
                title: "AA",
                description: "x",
                internId: VALID_OID,
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
                title: "AA",
                description: "x",
                internId: VALID_OID,
                dueDate: "2026-12-31",
                attachments: tooMany,
            }),
        /Too big/i,
    )
})

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

test("listTasksQuerySchema accepts optional internId/projectId/programId filters", () => {
    const parsed = listTasksQuerySchema.parse({
        internId: VALID_OID,
        projectId: VALID_OID,
        programId: VALID_OID,
    })
    assert.equal(parsed.internId, VALID_OID)
    assert.equal(parsed.projectId, VALID_OID)
    assert.equal(parsed.programId, VALID_OID)
})

test("listTasksQuerySchema rejects a malformed internId filter", () => {
    assert.throws(() => listTasksQuerySchema.parse({ internId: "nope" }), /Invalid id/i)
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

test("taskIdParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = taskIdParamSchema.parse({ taskId: VALID_OID })
    assert.equal(parsed.taskId, VALID_OID)
})

test("taskIdParamSchema rejects a malformed id", () => {
    assert.throws(() => taskIdParamSchema.parse({ taskId: "nope" }), /Invalid id/i)
})

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
