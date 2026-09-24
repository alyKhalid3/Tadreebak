import { test } from "node:test";
import assert from "node:assert/strict";
import { createReportSchema } from "./reports.validation";

const validTarget = "6ab1d2e3f4a5b6c7d8e9f0a1"

test("createReportSchema accepts a valid body", () => {
    const parsed = createReportSchema.parse({
        targetType: "company",
        targetId: validTarget,
        reason: "Spam posting in the title field.",
    })
    assert.equal(parsed.targetType, "company")
    assert.equal(parsed.targetId, validTarget)
})

test("createReportSchema accepts every targetType enum value", () => {
    for (const t of ["company", "user", "internship"]) {
        const parsed = createReportSchema.parse({
            targetType: t,
            targetId: validTarget,
            reason: "Reported for testing",
        })
        assert.equal(parsed.targetType, t)
    }
})

test("createReportSchema rejects an unknown targetType", () => {
    assert.throws(() =>
        createReportSchema.parse({
            targetType: "post",
            targetId: validTarget,
            reason: "Reported for testing",
        }),
    )
})

test("createReportSchema rejects a bad targetId", () => {
    assert.throws(() =>
        createReportSchema.parse({
            targetType: "company",
            targetId: "not-an-objectid",
            reason: "Reported for testing",
        }),
    )
})

test("createReportSchema rejects a too-short reason", () => {
    assert.throws(() =>
        createReportSchema.parse({
            targetType: "company",
            targetId: validTarget,
            reason: "x",
        }),
    )
})

test("createReportSchema rejects a > 1000-char reason", () => {
    assert.throws(() =>
        createReportSchema.parse({
            targetType: "company",
            targetId: validTarget,
            reason: "x".repeat(1001),
        }),
    )
})

test("createReportSchema trims the reason", () => {
    const parsed = createReportSchema.parse({
        targetType: "user",
        targetId: validTarget,
        reason: "  rude in chat  ",
    })
    assert.equal(parsed.reason, "rude in chat")
})
