// Tests for the pure aggregation helpers. The Mongo-touching
// functions (companyKpis, monthlyAttendanceChart, etc.) are not
// tested here — they need a real DB. The score-computation helper
// is pure and IS tested, because it drives the overallScore field
// the dashboard sorts by.

import { test } from "node:test"
import assert from "node:assert/strict"
import { computeOverallScore } from "./evaluation"

test("computeOverallScore with all zeros = 0", () => {
    assert.equal(computeOverallScore(0, 0, 0, 0), 0)
})

test("computeOverallScore with all max = 100", () => {
    // 30% × 100 (attendance) + 30% × 100 (skill) + 20% × 100 (teamwork)
    // + 20% × 100 (engagement) = 100
    assert.equal(computeOverallScore(100, 5, 5, 100), 100)
})

test("computeOverallScore is clamped to [0, 100]", () => {
    // Defensive: even if a caller passes a rating > 5 or engagement > 100,
    // the result is clamped. (The schema rejects them, but this is
    // belt-and-suspenders for the service layer.)
    assert.ok(computeOverallScore(200, 10, 10, 200) <= 100)
    assert.ok(computeOverallScore(-50, -1, -1, -50) >= 0)
})

test("computeOverallScore weights: attendance 30%, skill 30%, teamwork 20%, engagement 20%", () => {
    // 100 attendance + 0 skill + 0 teamwork + 0 engagement = 30
    assert.equal(computeOverallScore(100, 0, 0, 0), 30)
    // 0 attendance + 100 skill (= rating 5) + 0 + 0 = 30
    assert.equal(computeOverallScore(0, 5, 0, 0), 30)
    // 0 + 0 + 100 teamwork (= rating 5) + 0 = 20
    assert.equal(computeOverallScore(0, 0, 5, 0), 20)
    // 0 + 0 + 0 + 100 engagement = 20
    assert.equal(computeOverallScore(0, 0, 0, 100), 20)
})

test("computeOverallScore defaults engagement to 0 when omitted", () => {
    // The 3-arg form is what the service uses today (engagement
    // isn't wired up yet, so it always falls back to 0).
    // 30% × 80 (attendance) + 30% × 80 (skill = 4/5 × 100)
    // + 20% × 80 (teamwork = 4/5 × 100) + 0 (engagement)
    // = 24 + 24 + 16 + 0 = 64
    assert.equal(computeOverallScore(80, 4, 4), 64)
})

test("computeOverallScore is rounded to 2 decimals", () => {
    // 50 attendance + 3.333 skill + 0 + 0 → 30 + 30 × (3.333/5 × 100) / 100
    // = 30 + 19.998 = 49.998 → rounds to 50
    const score = computeOverallScore(50, 3.333, 0, 0)
    // 50 + (3.333/5 * 100) = 50 + 66.66, weighted: 30% × 50 = 15,
    // 30% × 66.66 = 20, total = 35. Rounded = 35
    // 30 × 50 / 100 = 15, (3.333/5) × 100 = 66.66, 30 × 66.66 / 100 = 20
    // sum = 35
    assert.equal(score, 35)
})
