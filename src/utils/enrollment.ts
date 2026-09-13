// Phase 5 — enrollment helpers.
//
// Every place that needs to ask "is this user an intern at THIS
// company" should go through these helpers instead of poking at
// `user.enrollmentCompanyId` directly. The old single-company fields
// are still readable for the migration window but new code never
// writes to them.
//
// All helpers are pure functions over the IUser shape — they don't
// touch the DB. The service layer loads the user once and asks these
// helpers for the right enrollment record.

import { Types } from "mongoose"
import { EnrollmentStatus, IEnrollment, IUser } from "../DB/types/user.type"

/**
 * The intern's currently-active enrollment at a given company, or
 * null. "Active" means status === 'active'. Use this to gate
 * "can this intern do X at this company?" checks.
 */
export const findActiveEnrollmentAt = (
    user: Pick<IUser, "enrollments">,
    companyId: string | Types.ObjectId,
): IEnrollment | null => {
    if (!user.enrollments || user.enrollments.length === 0) return null
    const cid = companyId.toString()
    return (
        user.enrollments.find(
            (e) =>
                e.companyId.toString() === cid && e.status === EnrollmentStatus.ACTIVE,
        ) ?? null
    )
}

/**
 * Any enrollment at a given company, regardless of status. Used by
 * the roster to list "all interns ever" (active + alumni +
 * withdrawn) and by the cache warmer.
 */
export const findAnyEnrollmentAt = (
    user: Pick<IUser, "enrollments">,
    companyId: string | Types.ObjectId,
): IEnrollment | null => {
    if (!user.enrollments || user.enrollments.length === 0) return null
    const cid = companyId.toString()
    return (
        user.enrollments.find((e) => e.companyId.toString() === cid) ?? null
    )
}

/**
 * True if the user has at least one active enrollment anywhere.
 * Used by the requireIntern middleware (the role-based check is
 * unreliable because of stale JWTs).
 */
export const hasAnyActiveEnrollment = (user: Pick<IUser, "enrollments">): boolean => {
    if (!user.enrollments || user.enrollments.length === 0) return false
    return user.enrollments.some((e) => e.status === EnrollmentStatus.ACTIVE)
}

/**
 * True if the user has an active enrollment at the given company.
 * The simple "can this user do intern things at this company?" check.
 */
export const hasActiveEnrollmentAt = (
    user: Pick<IUser, "enrollments">,
    companyId: string | Types.ObjectId,
): boolean => findActiveEnrollmentAt(user, companyId) !== null

/**
 * True if the user has any enrollment record (active, completed,
 * or withdrawn) at the given company. Used to block same-company
 * re-accept when the previous enrollment is still active.
 */
export const hasAnyEnrollmentAt = (
    user: Pick<IUser, "enrollments">,
    companyId: string | Types.ObjectId,
): boolean => findAnyEnrollmentAt(user, companyId) !== null

/**
 * Build a new enrollment sub-doc for the accept flow. The caller is
 * expected to push this into user.enrollments via $push.
 */
export const buildNewEnrollment = (
    companyId: string | Types.ObjectId,
    internshipStartDate: Date = new Date(),
    internshipEndDate: Date | null = null,
): IEnrollment => ({
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(companyId.toString()),
    status: EnrollmentStatus.ACTIVE,
    enrolledAt: new Date(),
    internshipStartDate,
    internshipEndDate,
    totalPoints: 0,
})

/**
 * Per-company projection of an enrollment. Useful for the picker
 * UI: "here are all my active enrollments, pick one".
 */
export const projectEnrollment = (e: IEnrollment) => ({
    _id: e._id,
    companyId: e.companyId,
    status: e.status,
    enrolledAt: e.enrolledAt,
    internshipStartDate: e.internshipStartDate,
    internshipEndDate: e.internshipEndDate,
    totalPoints: e.totalPoints,
})

/**
 * Migration helper: derive an enrollment from the legacy single-
 * company fields on a User doc. Used by the migration script
 * (src/scripts/migrate-to-enrollments.ts) and by lazy-fallback
 * readers that still consult the old fields.
 */
export const enrollmentFromLegacyFields = (
    user: Pick<
        IUser,
        | "enrollmentCompanyId"
        | "enrolledAt"
        | "internshipStartDate"
        | "internshipEndDate"
        | "totalPoints"
    >,
): IEnrollment | null => {
    if (!user.enrollmentCompanyId) return null
    return {
        companyId: user.enrollmentCompanyId,
        status: EnrollmentStatus.ACTIVE,
        enrolledAt: user.enrolledAt ?? new Date(),
        internshipStartDate: user.internshipStartDate ?? new Date(),
        internshipEndDate: user.internshipEndDate ?? null,
        totalPoints: user.totalPoints ?? 0,
    }
}
