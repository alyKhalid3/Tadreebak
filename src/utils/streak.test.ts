import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCheckin, type StreakState } from "./streak";

const D = (iso: string) => new Date(iso)

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// applyCheckin
// ---------------------------------------------------------------------------

test("applyCheckin: null last → first check-in (count=1, last=now)", () => {
    const now = D('2026-09-01T08:00:00Z')
    const out = applyCheckin({ count: 0, last: null }, now)
    assert.equal(out.count, 1)
    assert.equal(out.last, now)
})

test("applyCheckin: same-day check-in → no-op (idempotent)", () => {
    const earlier = D('2026-09-01T08:00:00Z')
    const later = D('2026-09-01T22:00:00Z')
    const out = applyCheckin({ count: 7, last: earlier }, later)
    assert.equal(out.count, 7)
    assert.equal(out.last, earlier)
})

test("applyCheckin: consecutive day → increment", () => {
    const last = D('2026-09-01T23:00:00Z')
    const now = D('2026-09-02T01:00:00Z')
    const out = applyCheckin({ count: 7, last }, now)
    assert.equal(out.count, 8)
    assert.equal(out.last, now)
})

test("applyCheckin: gap of 2+ days → reset to 1", () => {
    const last = D('2026-09-01T12:00:00Z')
    const now = D('2026-09-05T12:00:00Z')
    const out = applyCheckin({ count: 99, last }, now)
    assert.equal(out.count, 1)
    assert.equal(out.last, now)
})

test("applyCheckin: clock skew (negative diff) → no-op", () => {
    // Defensive: if `last` is in the future relative to `now`
    // (e.g. server clock moved backward), don't go negative.
    const last = D('2026-09-02T12:00:00Z')
    const now = D('2026-09-01T12:00:00Z')
    const out = applyCheckin({ count: 7, last }, now)
    assert.equal(out.count, 7)
    assert.equal(out.last, last)
})

test("applyCheckin: exactly 24h later is still same-day (idempotent)", () => {
    // `toUtcDay` collapses to a day boundary; check-ins within
    // the same UTC day don't double-count regardless of the
    // exact hour.
    const last = D('2026-09-01T00:00:00Z')
    const now = D('2026-09-01T23:59:59Z')
    const out = applyCheckin({ count: 7, last }, now)
    assert.equal(out.count, 7)
})

test("applyCheckin: at the day boundary (midnight) advances to next day", () => {
    // 23:59:59 → 00:00:00 next day → diffDays = 1 → increment.
    const last = D('2026-09-01T23:59:59Z')
    const now = D('2026-09-02T00:00:00Z')
    const out = applyCheckin({ count: 3, last }, now)
    assert.equal(out.count, 4)
})

test("applyCheckin: one second past midnight next day → increment", () => {
    const last = D('2026-09-01T23:59:59Z')
    const now = D('2026-09-02T00:00:01Z')
    const out = applyCheckin({ count: 0, last }, now)
    assert.equal(out.count, 1) // gap of 1 day from 9-1 to 9-2, but starting at 0 → +1 to 1
})

test("applyCheckin: gap resets even after long streak", () => {
    const last = D('2026-08-20T12:00:00Z')
    const now = D('2026-09-01T12:00:00Z')
    const out = applyCheckin({ count: 365, last }, now)
    assert.equal(out.count, 1)
})

test("applyCheckin: `last` exactly one full day after, same wall time", () => {
    const last = D('2026-09-01T12:00:00.000Z')
    const now = D('2026-09-02T12:00:00.000Z')
    const out = applyCheckin({ count: 1, last }, now)
    assert.equal(out.count, 2)
    // sanity: diff is exactly MS_PER_DAY
    const diffMs = new Date(out.last!).getTime() - last.getTime()
    assert.equal(diffMs, MS_PER_DAY)
})
