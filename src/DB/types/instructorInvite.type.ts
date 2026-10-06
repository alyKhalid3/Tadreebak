// Phase 18 / Company staff / Instructor invite audit trail.
//
// Mirrors the pattern from `internshipInvite.type.ts` — a small
// audit-only collection that records every invitation the company
// owner issues, so the "Sarah invited ali@example.com on Tuesday,
// he accepted on Wednesday, was removed on Friday" story is
// replayable.
//
// The active state itself lives on `User.companyAffiliation` (and is
// mirrored on `Company.instructors[]`). This collection is the
// history, not the truth — list endpoints should prefer the live
// user fields, with this collection reserved for the admin-side
// audit log.
import { Types } from "mongoose"

export enum InstructorInviteStatus {
    PENDING = 'pending',     // invite sent, instructor hasn't accepted yet
    ACCEPTED = 'accepted',   // instructor signed in / set their password
    REVOKED = 'revoked',     // company owner cancelled before acceptance
    EXPIRED = 'expired',     // invite token TTL elapsed without acceptance
}

export interface IInstructorInvite {
    companyId: Types.ObjectId
    // The instructor (User _id). For a newly invited email that
    // doesn't yet have a User row, this is set once the placeholder
    // user is created. The (companyId, email) pair is the
    // pre-creation uniqueness key (a unique partial on email +
    // status: 'pending').
    instructorId: Types.ObjectId
    email: string
    // The company owner who issued the invite. Useful for the
    // audit log ("who invited this person?").
    invitedBy: Types.ObjectId
    // Phase 18B: the role this staff member will be assigned.
    // Required for any new invite; old invites (Phase 18) used
    // the hardcoded Instructor role, but the refactor to a
    // permission-based system reads roleId here.
    roleId: Types.ObjectId
    status: InstructorInviteStatus
    // Optional short note the admin typed when sending the invite.
    note?: string
    // SHA-256 hashes of the two one-time tokens. Both are
    // `select: false` on the schema — endpoints opt in explicitly.
    // The two emails in the flow (confirm + setup) carry two
    // different raw tokens; the hashes are compared timing-safe
    // in the service.
    confirmTokenHash?: string | null
    setupTokenHash?: string | null
    // The TTL is reused across the confirm + setup steps. The
    // 7-day window starts at invite creation. After the
    // recipient confirms, we re-arm the expiry to a 24-hour
    // window for the password-setup step.
    expiresAt?: Date | null
    // Set when the recipient clicks the confirm link. The accept
    // endpoint refuses if `confirmedAt` is null — defense in
    // depth against a leaked setup token skipping the confirm.
    confirmedAt?: Date | null
    acceptedAt?: Date | null
    revokedAt?: Date | null
    revokedBy?: Types.ObjectId | null
}