/**
 * H1: previously the rating system persisted an `avgRating` field and
 * updated it via a non-atomic read-modify-write — two concurrent ratings
 * could both read the same old avg, compute the same new avg, and write
 * it back, drifting the average away from the true mean.
 *
 * We now only persist `ratingSum` and `ratingCount`, and compute the
 * average on read with this helper. Adding a new rating is then a single
 * `$inc` on both fields, which is race-free.
 *
 * @returns null if no ratings yet, else the average rounded to 2 decimals.
 */
export const computeAvgRating = (doc: { ratingCount?: number; ratingSum?: number } | null | undefined): number | null => {
    const count = doc?.ratingCount ?? 0
    const sum = doc?.ratingSum ?? 0
    if (count <= 0) return null
    return Math.round((sum / count) * 100) / 100
}
