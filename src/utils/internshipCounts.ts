/**
 * Pure helper for `GET /internships` and the company-side
 * internship list — merges a per-id applicants count map into
 * an array of internships. Extracted so the merge logic is
 * testable without a MongoDB fixture.
 *
 * Input shape (from `ApplicationModel.aggregate`):
 *   [{ _id: internshipId, count: number }, ...]
 *
 * Missing keys fall back to 0 — that's the common case for
 * internships that haven't received any applications yet.
 *
 * Counts are returned as `applicantsCount`. The name is
 * hand-picked for the BACKEND_GAPS_EN wire contract — the
 * frontend was previously calling
 * `GET /applications?internshipId=X&limit=1` per posting to
 * build the same number; this collapses N+1 into one round
 * trip.
 */

export interface ApplicantsCountEntry {
    _id: unknown
    count: number
}

export interface WithApplicantsCount<T> {
    _id: unknown
    applicantsCount: number
}

/**
 * Merge an applicants-count map into a list of internships.
 * Preserves the original order of `internships` and mutates each
 * row in place by spreading the count on top. Returning the same
 * shape keeps the Mongoose pipeline ergonomic.
 */
export const mergeApplicantsCount = <T extends { _id: unknown }>(
    internships: T[],
    counts: ApplicantsCountEntry[],
): Array<T & WithApplicantsCount<T>> => {
    const map = new Map<string, number>()
    for (const entry of counts) {
        if (entry && entry._id != null) {
            map.set(String(entry._id), entry.count ?? 0)
        }
    }
    return internships.map((internship) => ({
        ...internship,
        applicantsCount: map.get(String(internship._id)) ?? 0,
    }))
}
