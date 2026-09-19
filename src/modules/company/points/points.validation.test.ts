import { test } from "node:test";
import assert from "node:assert/strict";
import {
    createRuleSchema,
    updateRuleSchema,
    listRulesQuerySchema,
    ruleIdParamSchema,
    createMilestoneSchema,
    updateMilestoneSchema,
    milestoneIdParamSchema,
    listMilestonesQuerySchema,
} from "./points.validation";

// ---------------------------------------------------------------------------
// createRuleSchema
// ---------------------------------------------------------------------------

test("createRuleSchema accepts a valid rule", () => {
    const parsed = createRuleSchema.parse({
        title: "Daily attendance",
        category: "attendance",
        points: 5,
        frequency: "daily",
        description: "Be present every day",
    })
    assert.equal(parsed.title, "Daily attendance")
    assert.equal(parsed.points, 5)
    assert.equal(parsed.category, "attendance")
    assert.equal(parsed.frequency, "daily")
})

test("createRuleSchema rejects a 1-char title", () => {
    assert.throws(() =>
        createRuleSchema.parse({
            title: "A",
            category: "attendance",
            points: 5,
            frequency: "daily",
        }),
    )
})

test("createRuleSchema rejects points = 0", () => {
    assert.throws(() =>
        createRuleSchema.parse({
            title: "Zero",
            category: "attendance",
            points: 0,
            frequency: "daily",
        }),
    )
})

test("createRuleSchema rejects points = -5", () => {
    assert.throws(() =>
        createRuleSchema.parse({
            title: "Negative",
            category: "attendance",
            points: -5,
            frequency: "daily",
        }),
    )
})

test("createRuleSchema rejects points > 10000", () => {
    assert.throws(() =>
        createRuleSchema.parse({
            title: "Huge",
            category: "attendance",
            points: 99999,
            frequency: "daily",
        }),
    )
})

test("createRuleSchema rejects a bad category enum", () => {
    assert.throws(() =>
        createRuleSchema.parse({
            title: "Test",
            category: "wrong",
            points: 5,
            frequency: "daily",
        }),
    )
})

test("createRuleSchema rejects a bad frequency enum", () => {
    assert.throws(() =>
        createRuleSchema.parse({
            title: "Test",
            category: "attendance",
            points: 5,
            frequency: "hourly",
        }),
    )
})

test("createRuleSchema accepts every category enum value", () => {
    for (const cat of ["attendance", "tasks", "performance", "community"]) {
        const parsed = createRuleSchema.parse({
            title: "Test",
            category: cat,
            points: 5,
            frequency: "daily",
        })
        assert.equal(parsed.category, cat)
    }
})

test("createRuleSchema accepts every frequency enum value", () => {
    for (const freq of ["daily", "weekly", "per_task", "one_time"]) {
        const parsed = createRuleSchema.parse({
            title: "Test",
            category: "attendance",
            points: 5,
            frequency: freq,
        })
        assert.equal(parsed.frequency, freq)
    }
})

test("createRuleSchema accepts numeric points via coercion", () => {
    // Frontend might send points as a string from form data; the
    // service expects a number. Coercion ensures we never see
    // "5" string reaching Mongoose.
    const parsed = createRuleSchema.parse({
        title: "Coerce",
        category: "tasks",
        points: "15",
        frequency: "per_task",
    })
    assert.equal(parsed.points, 15)
    assert.equal(typeof parsed.points, "number")
})

test("createRuleSchema description is optional", () => {
    const parsed = createRuleSchema.parse({
        title: "No desc",
        category: "attendance",
        points: 5,
        frequency: "daily",
    })
    assert.equal(parsed.description, undefined)
})

// ---------------------------------------------------------------------------
// updateRuleSchema
// ---------------------------------------------------------------------------

test("updateRuleSchema rejects an empty body (no-op protection)", () => {
    assert.throws(() => updateRuleSchema.parse({}))
})

test("updateRuleSchema accepts a partial body", () => {
    const parsed = updateRuleSchema.parse({ title: "New title" })
    assert.equal(parsed.title, "New title")
})

test("updateRuleSchema accepts status flip to inactive", () => {
    const parsed = updateRuleSchema.parse({ status: "inactive" })
    assert.equal(parsed.status, "inactive")
})

test("updateRuleSchema rejects an invalid status", () => {
    assert.throws(() => updateRuleSchema.parse({ status: "deleted" }))
})

// ---------------------------------------------------------------------------
// listRulesQuerySchema
// ---------------------------------------------------------------------------

test("listRulesQuerySchema defaults page=1, limit=50", () => {
    const parsed = listRulesQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 50)
})

test("listRulesQuerySchema coerces string page/limit to numbers", () => {
    const parsed = listRulesQuerySchema.parse({ page: "3", limit: "10" })
    assert.equal(parsed.page, 3)
    assert.equal(parsed.limit, 10)
})

test("listRulesQuerySchema rejects limit > 100", () => {
    assert.throws(() => listRulesQuerySchema.parse({ limit: 999 }))
})

// ---------------------------------------------------------------------------
// ruleIdParamSchema
// ---------------------------------------------------------------------------

test("ruleIdParamSchema accepts a 24-char hex id", () => {
    const id = "6ab1d2e3f4a5b6c7d8e9f0a1"
    const parsed = ruleIdParamSchema.parse({ ruleId: id })
    assert.equal(parsed.ruleId, id)
})

test("ruleIdParamSchema rejects a non-hex id", () => {
    assert.throws(() => ruleIdParamSchema.parse({ ruleId: "not-an-objectid" }))
})

// ---------------------------------------------------------------------------
// createMilestoneSchema
// ---------------------------------------------------------------------------

test("createMilestoneSchema accepts a valid milestone", () => {
    const parsed = createMilestoneSchema.parse({
        title: "First 100 points",
        threshold: 100,
        reward: "Coffee voucher",
    })
    assert.equal(parsed.title, "First 100 points")
    assert.equal(parsed.threshold, 100)
    assert.equal(parsed.reward, "Coffee voucher")
})

test("createMilestoneSchema rejects threshold = 0", () => {
    assert.throws(() =>
        createMilestoneSchema.parse({
            title: "Zero",
            threshold: 0,
            reward: "Nothing",
        }),
    )
})

test("createMilestoneSchema rejects empty reward", () => {
    assert.throws(() =>
        createMilestoneSchema.parse({
            title: "Empty reward",
            threshold: 100,
            reward: "",
        }),
    )
})

test("createMilestoneSchema rejects threshold > 1_000_000", () => {
    assert.throws(() =>
        createMilestoneSchema.parse({
            title: "Absurd",
            threshold: 2_000_000,
            reward: "Bugatti",
        }),
    )
})

test("createMilestoneSchema coerces string threshold", () => {
    const parsed = createMilestoneSchema.parse({
        title: "Coerce",
        threshold: "250",
        reward: "Sticker pack",
    })
    assert.equal(parsed.threshold, 250)
    assert.equal(typeof parsed.threshold, "number")
})

// ---------------------------------------------------------------------------
// updateMilestoneSchema
// ---------------------------------------------------------------------------

test("updateMilestoneSchema rejects empty body", () => {
    assert.throws(() => updateMilestoneSchema.parse({}))
})

test("updateMilestoneSchema accepts partial update", () => {
    const parsed = updateMilestoneSchema.parse({ threshold: 500 })
    assert.equal(parsed.threshold, 500)
})

// ---------------------------------------------------------------------------
// milestoneIdParamSchema
// ---------------------------------------------------------------------------

test("milestoneIdParamSchema accepts a 24-char hex id", () => {
    const id = "6ab1d2e3f4a5b6c7d8e9f0a2"
    const parsed = milestoneIdParamSchema.parse({ milestoneId: id })
    assert.equal(parsed.milestoneId, id)
})

test("milestoneIdParamSchema rejects bad shape", () => {
    assert.throws(() => milestoneIdParamSchema.parse({ milestoneId: "abc" }))
})

// ---------------------------------------------------------------------------
// listMilestonesQuerySchema
// ---------------------------------------------------------------------------

test("listMilestonesQuerySchema defaults page=1, limit=50", () => {
    const parsed = listMilestonesQuerySchema.parse({})
    assert.equal(parsed.page, 1)
    assert.equal(parsed.limit, 50)
})

test("listMilestonesQuerySchema coerces page/limit", () => {
    const parsed = listMilestonesQuerySchema.parse({ page: "2", limit: "25" })
    assert.equal(parsed.page, 2)
    assert.equal(parsed.limit, 25)
})
