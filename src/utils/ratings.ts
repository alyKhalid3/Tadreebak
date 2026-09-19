/**
 * Pure helpers for `GET /company/:companyId/ratings`. Keeping the
 * math out of the service layer means we can unit-test the stats
 * without a MongoDB fixture.
 *
 * Inputs are normalized "rating rows" — whatever shape the service
 * layer produces after the aggregation $lookup. The two important
 * contracts:
 *
 *   1. `score` is an integer in [1, 5] — the rate endpoint enforces
 *      `min:1, max:5` in the schema, so we trust the value.
 *   2. We DO NOT include ratings from cancelled / non-completed
 *      applications — the service layer filters those out before
 *      calling `computeRatingStats`. Cancelled ratings never reach
 *      this function.
 */

export interface RatingRow {
    score: number
    comment?: string | null
    createdAt: Date
    // Hydrated by the aggregation lookup — both are nullable because
    // a stale rating row could point at a deleted user / internship.
    rater?: { firstName?: string; lastName?: string } | null
    internship?: { track?: string[] } | null
}

export interface RatingHistogramBucket {
    stars: 1 | 2 | 3 | 4 | 5
    pct: number
}

export interface RatingReview {
    student: string
    track: string
    rating: number
    date: Date
    body: string
}

export interface CompanyRatingStats {
    avg: number
    count: number
    histogram: RatingHistogramBucket[]
    reviews: RatingReview[]
}

/**
 * Build the privacy-preserving reviewer display name:
 *   "Sara M."  ← first name + first letter of last name.
 * Falls back to "Anonymous" if the rater doc is missing or empty.
 */
const displayName = (rater: RatingRow['rater']) => {
    if (!rater) return 'Anonymous'
    const first = (rater.firstName ?? '').trim()
    const last = (rater.lastName ?? '').trim()
    if (!first && !last) return 'Anonymous'
    if (!last) return first
    return `${first} ${last.charAt(0).toUpperCase()}.`
}

/**
 * Track is an array on IInternShip. For the company-page review card
 * we want a single label. Take the first track, or empty string when
 * the internship has none. We deliberately don't join multiple
 * tracks — the UI renders one pill.
 */
const trackLabel = (internship: RatingRow['internship']) => {
    const t = internship?.track
    if (!Array.isArray(t) || t.length === 0) return ''
    return t[0] ?? ''
}

/**
 * Round to one decimal — the company page renders "4.6" / "4.7" etc.
 */
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Round an integer percentage so the histogram sums to exactly 100.
 * Without this, `Math.round((5/7)*100) = 71` etc. can leave the
 * five buckets summing to 99 or 101. We give any rounding remainder
 * to the largest bucket so totals are always exactly 100 when
 * `count > 0`.
 *
 * Returns an array of zeros when `count === 0` — no fake signal.
 */
const buildHistogram = (
    buckets: Record<1 | 2 | 3 | 4 | 5, number>,
    count: number,
): RatingHistogramBucket[] => {
    if (count === 0) {
        return [5, 4, 3, 2, 1].map((s) => ({ stars: s as 1 | 2 | 3 | 4 | 5, pct: 0 }))
    }
    // Floor first so we never produce a sum > 100, then add the
    // remainder to the bucket with the most votes.
    const raw = ([5, 4, 3, 2, 1] as const).map((stars) => ({
        stars,
        pct: Math.floor((buckets[stars] / count) * 100),
    }))
    const sum = raw.reduce((a, b) => a + b.pct, 0)
    const remainder = 100 - sum
    if (remainder !== 0) {
        // Largest bucket wins the remainder (avoids the 1-star bucket
        // getting +1 just because it has the most votes among low
        // scores; this is "show the most common bucket prominently").
        let maxIdx = 0
        for (let i = 1; i < raw.length; i++) {
            const a = buckets[raw[i]!.stars]
            const b = buckets[raw[maxIdx]!.stars]
            if (a > b) maxIdx = i
        }
        raw[maxIdx]!.pct += remainder
    }
    return raw
}

/**
 * Aggregate a list of rating rows into the response shape consumed
 * by `GET /company/:companyId/ratings`:
 *
 *   { avg, count, histogram, reviews }
 *
 * - `avg` is the mean of `score`, rounded to 1 decimal. `0` when empty.
 * - `count` is `ratings.length`.
 * - `histogram` is 5 buckets (5..1) summing to exactly 100% (or all
 *   zeros when empty).
 * - `reviews` is the top 5 ratings with a comment, newest first.
 *
 * The function is pure — same input always gives the same output —
 * so it's trivially cacheable.
 */
export const computeRatingStats = (
    ratings: RatingRow[],
    opts: { maxReviews?: number } = {},
): CompanyRatingStats => {
    const count = ratings.length
    if (count === 0) {
        return {
            avg: 0,
            count: 0,
            histogram: buildHistogram({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, 0),
            reviews: [],
        }
    }

    const sum = ratings.reduce((acc, r) => acc + r.score, 0)
    const avg = round1(sum / count)

    const buckets: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const r of ratings) {
        const stars = Math.round(r.score) as 1 | 2 | 3 | 4 | 5
        if (stars >= 1 && stars <= 5) buckets[stars] += 1
    }

    const histogram = buildHistogram(buckets, count)

    // Reviews: filter to those with a non-empty comment, take the
    // top N newest. The service layer already sorts by createdAt
    // DESC, so `slice(0, N)` is enough — no re-sort needed.
    const maxReviews = opts.maxReviews ?? 5
    const reviews: RatingReview[] = []
    for (const r of ratings) {
        if (!r.comment || r.comment.trim() === '') continue
        reviews.push({
            student: displayName(r.rater),
            track: trackLabel(r.internship),
            rating: r.score,
            date: r.createdAt,
            body: r.comment.trim(),
        })
        if (reviews.length >= maxReviews) break
    }

    return { avg, count, histogram, reviews }
}
