// Phase 4 — Evaluation validation tests.
//
// Pin the input contract for create / update / list. The service
// re-derives attendanceRate and overallScore from the period and
// the ratings, so the schema is the only thing that can break.

import { test } from "node:test"
import assert from "node:assert/strict"
import {
    createEvaluationSchema,
    updateEvaluationSchema,
    listEvaluationsQuerySchema,
    evaluationIdParamSchema,
    internIdParamSchema,
    myEvaluationsQuerySchema,
} from "./evaluations.validation"

const VALID_OID = "6ab1c2d3e4f5a6b7c8d9e0f1"

test("createEvaluationSchema accepts a valid eval with all fields", () => {
    const parsed = createEvaluationSchema.parse({
        internId: VALID_OID,
        period: { start: "2026-01-01", end: "2026-01-31" },
        skillRating: 4.5,
        teamworkRating: 4,
        strengths: "Strong communication",
        improvements: "Speak up more in standups",
        privateNotes: "Will need a follow-up next month",
    })
    assert.equal(parsed.internId, VALID_OID)
    assert.equal(parsed.skillRating, 4.5)
    assert.equal(parsed.teamworkRating, 4)
    assert.equal(parsed.strengths, "Strong communication")
})

test("createEvaluationSchema coerces string ratings (the rating field is z.coerce.number)", () => {
    const parsed = createEvaluationSchema.parse({
        internId: VALID_OID,
        period: { start: "2026-01-01", end: "2026-01-31" },
        skillRating: "4.5",
        teamworkRating: "3",
    })
    assert.equal(parsed.skillRating, 4.5)
    assert.equal(parsed.teamworkRating, 3)
})

test("createEvaluationSchema coerces ISO string dates", () => {
    const parsed = createEvaluationSchema.parse({
        internId: VALID_OID,
        period: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-31T23:59:59.000Z" },
        skillRating: 4,
        teamworkRating: 4,
    })
    assert.equal(parsed.period.start instanceof Date, true)
    assert.equal(parsed.period.end instanceof Date, true)
})

test("createEvaluationSchema rejects period.end < period.start", () => {
    assert.throws(
        () =>
            createEvaluationSchema.parse({
                internId: VALID_OID,
                period: { start: "2026-01-31", end: "2026-01-01" },
                skillRating: 4,
                teamworkRating: 4,
            }),
        /period\.end must be on or after period\.start/i,
    )
})

test("createEvaluationSchema accepts period.end == period.start (single-day eval)", () => {
    const parsed = createEvaluationSchema.parse({
        internId: VALID_OID,
        period: { start: "2026-01-15", end: "2026-01-15" },
        skillRating: 4,
        teamworkRating: 4,
    })
    assert.equal(parsed.period.start.toISOString().slice(0, 10), "2026-01-15")
    assert.equal(parsed.period.end.toISOString().slice(0, 10), "2026-01-15")
})

test("createEvaluationSchema rejects skillRating > 5", () => {
    assert.throws(
        () =>
            createEvaluationSchema.parse({
                internId: VALID_OID,
                period: { start: "2026-01-01", end: "2026-01-31" },
                skillRating: 5.5,
                teamworkRating: 4,
            }),
        /Too big/i,
    )
})

test("createEvaluationSchema rejects skillRating < 0", () => {
    assert.throws(
        () =>
            createEvaluationSchema.parse({
                internId: VALID_OID,
                period: { start: "2026-01-01", end: "2026-01-31" },
                skillRating: -0.5,
                teamworkRating: 4,
            }),
        /Too small/i,
    )
})

test("createEvaluationSchema accepts skillRating = 0 and = 5 (the boundaries)", () => {
    const low = createEvaluationSchema.parse({
        internId: VALID_OID,
        period: { start: "2026-01-01", end: "2026-01-31" },
        skillRating: 0,
        teamworkRating: 0,
    })
    const high = createEvaluationSchema.parse({
        internId: VALID_OID,
        period: { start: "2026-01-01", end: "2026-01-31" },
        skillRating: 5,
        teamworkRating: 5,
    })
    assert.equal(low.skillRating, 0)
    assert.equal(high.skillRating, 5)
})

test("createEvaluationSchema rejects a malformed internId", () => {
    assert.throws(
        () =>
            createEvaluationSchema.parse({
                internId: "nope",
                period: { start: "2026-01-01", end: "2026-01-31" },
                skillRating: 4,
                teamworkRating: 4,
            }),
        /Invalid id/i,
    )
})

test("createEvaluationSchema rejects strengths over 2000 chars", () => {
    assert.throws(
        () =>
            createEvaluationSchema.parse({
                internId: VALID_OID,
                period: { start: "2026-01-01", end: "2026-01-31" },
                skillRating: 4,
                teamworkRating: 4,
                strengths: "x".repeat(2001),
            }),
        /Too big/i,
    )
})

test("createEvaluationSchema accepts privateNotes up to 5000 chars (admin-only field)", () => {
    const parsed = createEvaluationSchema.parse({
        internId: VALID_OID,
        period: { start: "2026-01-01", end: "2026-01-31" },
        skillRating: 4,
        teamworkRating: 4,
        privateNotes: "x".repeat(5000),
    })
    assert.equal((parsed.privateNotes ?? "").length, 5000)
})

test("updateEvaluationSchema requires at least one field", () => {
    // Empty patch — we reject this to avoid no-op updates.
    assert.throws(() => updateEvaluationSchema.parse({}), /at least one field/i)
})

test("updateEvaluationSchema accepts a single field", () => {
    const parsed = updateEvaluationSchema.parse({ skillRating: 3.5 })
    assert.equal(parsed.skillRating, 3.5)
    assert.equal(parsed.teamworkRating, undefined)
})

test("updateEvaluationSchema accepts strengths / improvements / privateNotes", () => {
    const parsed = updateEvaluationSchema.parse({
        strengths: "Quick learner",
        improvements: "Practice time estimation",
        privateNotes: "On track for promotion",
    })
    assert.equal(parsed.strengths, "Quick learner")
    assert.equal(parsed.improvements, "Practice time estimation")
    assert.equal(parsed.privateNotes, "On track for promotion")
})

test("listEvaluationsQuerySchema applies defaults (page=1, limit=20)", () => {
    const parsed = listEvaluationsQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
})

test("listEvaluationsQuerySchema accepts a YYYY-MM period filter", () => {
    const parsed = listEvaluationsQuerySchema.parse({ period: "2026-09" })
    assert.equal(parsed.period, "2026-09")
})

test("listEvaluationsQuerySchema accepts a YYYY period filter", () => {
    const parsed = listEvaluationsQuerySchema.parse({ period: "2026" })
    assert.equal(parsed.period, "2026")
})

test("listEvaluationsQuerySchema rejects a malformed period (too short)", () => {
    assert.throws(
        () => listEvaluationsQuerySchema.parse({ period: "20" }),
        /Too small/i,
    )
})

test("listEvaluationsQuerySchema rejects a malformed period (too long)", () => {
    assert.throws(
        () => listEvaluationsQuerySchema.parse({ period: "2026-09-15x" }),
        /Too big/i,
    )
})

test("listEvaluationsQuerySchema rejects limit > 100", () => {
    assert.throws(
        () => listEvaluationsQuerySchema.parse({ limit: "500" }),
        /Too big/i,
    )
})

test("listEvaluationsQuerySchema coerces string page/limit (Express query strings)", () => {
    const parsed = listEvaluationsQuerySchema.parse({ page: "2", limit: "30" })
    assert.equal(parsed.page, 2)
    assert.equal(parsed.limit, 30)
})

test("evaluationIdParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = evaluationIdParamSchema.parse({ evaluationId: VALID_OID })
    assert.equal(parsed.evaluationId, VALID_OID)
})

test("internIdParamSchema accepts a valid 24-char ObjectId", () => {
    const parsed = internIdParamSchema.parse({ internId: VALID_OID })
    assert.equal(parsed.internId, VALID_OID)
})

test("myEvaluationsQuerySchema applies defaults (page=1, limit=20)", () => {
    const parsed = myEvaluationsQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 20)
})
