/**
 * Phase 17 / P5 #12 — Daily streak check-in helpers.
 *
 * The wire shape is `{ count, last }` where:
 *   - `count` is the number of consecutive days the user has
 *     successfully checked in.
 *   - `last` is the timestamp of the most recent check-in, or
 *     `null` if the user has never checked in.
 *
 * The pure helper below decides whether the next check-in
 * should:
 *   - **increment** the streak (last check-in was yesterday),
 *   - **stay the same** (last check-in was earlier today — same
 *      day double-check is a no-op success),
 *   - **reset** to 1 (last check-in was more than one day ago —
 *      a gap in the streak), or
 *   - **start** at 1 (first check-in ever — no last recorded).
 *
 * The "day" comparison is done at midnight UTC. A tz-aware
 * follow-up would resolve the user's company-timezone midnight
 * via the `timezone.ts` helper, but the spec wires start with
 * UTC for simplicity. Cached separately.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Strip time-of-day — returns midnight UTC of the same date. */
const toUtcDay = (d: Date): Date => {
    const out = new Date(d.getTime())
    out.setUTCHours(0, 0, 0, 0)
    return out
}

export interface StreakState {
    count: number
    last: Date | null
}

/**
 * Apply a check-in to the streak state and return the next state.
 *
 * - `state.last === null` → first check-in, count = 1
 * - `state.last` is earlier today (UTC) → no-op, return state
 * - `state.last` is exactly yesterday → count + 1, last = now
 * - `state.last` is more than 1 day ago → reset, count = 1
 */
export const applyCheckin = (
    state: StreakState,
    now: Date = new Date(),
): StreakState => {
    if (state.last === null || state.last === undefined) {
        return { count: 1, last: now }
    }
    const lastDay = toUtcDay(state.last).getTime()
    const today = toUtcDay(now).getTime()
    const diffDays = Math.round((today - lastDay) / MS_PER_DAY)
    if (diffDays <= 0) {
        // Same day (diffDays === 0) or clock-skew (diffDays < 0).
        // Idempotent — return current state.
        return state
    }
    if (diffDays === 1) {
        return { count: (state.count ?? 0) + 1, last: now }
    }
    // Gap of 2+ days → reset.
    return { count: 1, last: now }
}
