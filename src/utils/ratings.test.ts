import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRatingStats, type RatingRow } from "./ratings";

const mk = (overrides: Partial<RatingRow>): RatingRow => ({
    score: 5,
    comment: null,
    createdAt: new Date("2026-09-01"),
    rater: null,
    internship: null,
    ...overrides,
})

test("computeRatingStats: empty input returns zeros and no reviews", () => {
    const stats = computeRatingStats([])
    assert.equal(stats.avg, 0)
    assert.equal(stats.count, 0)
    assert.equal(stats.histogram.length, 5)
    for (const b of stats.histogram) assert.equal(b.pct, 0)
    assert.deepEqual(stats.reviews, [])
})

test("computeRatingStats: averages to one decimal", () => {
    // 5 + 4 + 3 + 5 + 5 + 4 + 4 = 30 / 7 = 4.2857...
    const ratings = [
        mk({ score: 5 }),
        mk({ score: 4 }),
        mk({ score: 3 }),
        mk({ score: 5 }),
        mk({ score: 5 }),
        mk({ score: 4 }),
        mk({ score: 4 }),
    ]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.count, 7)
    assert.equal(stats.avg, 4.3)
})

test("computeRatingStats: histogram buckets always sum to 100", () => {
    // Odd counts that would force a remainder under naive rounding.
    // 1 five, 1 four, 1 three = sum floor = 33+33+33 = 99
    const ratings = [mk({ score: 5 }), mk({ score: 4 }), mk({ score: 3 })]
    const stats = computeRatingStats(ratings)
    const sum = stats.histogram.reduce((a, b) => a + b.pct, 0)
    assert.equal(sum, 100, `histogram buckets should sum to 100, got ${sum}`)
})

test("computeRatingStats: histogram bucket order is 5 → 1 (top to bottom)", () => {
    const ratings = [mk({ score: 1 }), mk({ score: 2 }), mk({ score: 3 }), mk({ score: 4 }), mk({ score: 5 })]
    const stats = computeRatingStats(ratings)
    assert.deepEqual(stats.histogram.map((b) => b.stars), [5, 4, 3, 2, 1])
})

test("computeRatingStats: histogram concentrates remainder into the largest bucket", () => {
    // 5 fives and 2 fours → floors are 71, 28 = 99. Largest (5 stars)
    // gets the +1.
    const ratings = [
        mk({ score: 5 }),
        mk({ score: 5 }),
        mk({ score: 5 }),
        mk({ score: 5 }),
        mk({ score: 5 }),
        mk({ score: 4 }),
        mk({ score: 4 }),
    ]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.histogram.find((b) => b.stars === 5)?.pct, 72)
    assert.equal(stats.histogram.find((b) => b.stars === 4)?.pct, 28)
    assert.equal(stats.histogram.find((b) => b.stars === 3)?.pct, 0)
})

test("computeRatingStats: reviews only include rows with non-empty comments", () => {
    const ratings = [
        mk({ score: 5, comment: '   ' }),
        mk({ score: 5, comment: null }),
        mk({ score: 5, comment: 'Great team!' }),
    ]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.reviews.length, 1)
    assert.equal(stats.reviews[0]?.body, 'Great team!')
})

test("computeRatingStats: reviews are capped at maxReviews", () => {
    const ratings = Array.from({ length: 8 }, (_, i) =>
        mk({ score: 5, comment: `review ${i}` })
    )
    const stats = computeRatingStats(ratings, { maxReviews: 3 })
    assert.equal(stats.reviews.length, 3)
})

test("computeRatingStats: student display name is 'First L.'", () => {
    const ratings = [
        mk({
            score: 5,
            comment: 'Loved it',
            rater: { firstName: 'Sara', lastName: 'Mansour' },
        }),
    ]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.reviews[0]?.student, 'Sara M.')
})

test("computeRatingStats: missing rater → 'Anonymous'", () => {
    const ratings = [mk({ score: 5, comment: 'x', rater: null })]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.reviews[0]?.student, 'Anonymous')
})

test("computeRatingStats: empty first+last name → 'Anonymous'", () => {
    const ratings = [
        mk({ score: 5, comment: 'x', rater: { firstName: '', lastName: '' } }),
    ]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.reviews[0]?.student, 'Anonymous')
})

test("computeRatingStats: missing internship → empty track", () => {
    const ratings = [mk({ score: 5, comment: 'x', internship: null })]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.reviews[0]?.track, '')
})

test("computeRatingStats: track uses the first element of the array", () => {
    const ratings = [
        mk({
            score: 5,
            comment: 'x',
            internship: { track: ['backend', 'fullstack', 'devops'] },
        }),
    ]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.reviews[0]?.track, 'backend')
})

test("computeRatingStats: review carries date + score through", () => {
    const date = new Date('2026-08-12T00:00:00Z')
    const ratings = [mk({ score: 4, comment: 'Solid experience.', createdAt: date })]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.reviews[0]?.rating, 4)
    assert.equal(stats.reviews[0]?.date, date)
    assert.equal(stats.reviews[0]?.body, 'Solid experience.')
})

test("computeRatingStats: review count is independent of histogram count", () => {
    // 7 ratings, 2 with comments → 2 reviews, but histogram still sums
    // to 100 based on 7 total votes.
    const ratings = [
        mk({ score: 5, comment: 'r1' }),
        mk({ score: 5 }),
        mk({ score: 4 }),
        mk({ score: 4 }),
        mk({ score: 4, comment: 'r2' }),
        mk({ score: 3 }),
        mk({ score: 2 }),
    ]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.count, 7)
    assert.equal(stats.reviews.length, 2)
    const sum = stats.histogram.reduce((a, b) => a + b.pct, 0)
    assert.equal(sum, 100)
})

test("computeRatingStats: histogram buckets outside [1,5] are ignored", () => {
    // Defensive: the schema enforces 1..5 but the helper should not
    // crash on garbage. Out-of-range values are dropped from the
    // bucket count (still counted in `count`, so the percentage
    // remains honest). 5-star gets the remainder because it's the
    // only valid bucket.
    const ratings = [
        mk({ score: 5 }),
        mk({ score: 0 }),
        mk({ score: 7 }),
    ]
    const stats = computeRatingStats(ratings)
    assert.equal(stats.count, 3) // count is all rows, not just bucketed
    assert.equal(stats.histogram.find((b) => b.stars === 5)?.pct, 100)
    assert.equal(stats.histogram.find((b) => b.stars === 4)?.pct, 0)
    const sum = stats.histogram.reduce((a, b) => a + b.pct, 0)
    assert.equal(sum, 100)
})
