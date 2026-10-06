// Phase 18B / Company staff validation.
//
// Admin-side endpoints (owner-only):
//   POST   /company/{companyId}/instructors              — invite by email + roleId
//   GET    /company/{companyId}/instructors              — list
//   PATCH  /company/{companyId}/instructors/{userId}     — rename
//   DELETE /company/{companyId}/instructors/{userId}     — soft-revoke
//   POST   /company/{companyId}/instructors/{userId}/resend-invite
//
// Public (no auth) two-step accept flow:
//   POST   /instructor-auth/confirm-invite               — click confirm link in email 1
//   POST   /instructor-auth/accept-invite                — set password from email 2
//
// All admin endpoints are owner-only — staff members themselves
// can't invite other staff. The two-step accept flow uses HMAC-
// signed tokens that are SHA-256-hashed on the row and compared
// timing-safe at verify time.
import { z } from "zod"

// PATCH is mostly there so the admin can rename a mis-typed
// staff member. Role rotation between roles isn't exposed here —
// the user would need to be re-invited or we'd add a separate
// `PATCH /instructors/{userId}/role` endpoint later.
export const updateInstructorSchema = z.object({
    firstName: z.string().trim().min(2).max(50).optional(),
    lastName: z.string().trim().min(2).max(50).optional(),
    note: z.string().trim().max(500).optional(),
})

// List query — for the admin "Team" page. `status: all | active | removed`
// gives the admin visibility into recently-revoked staff without
// needing a separate endpoint.
export const listInstructorsQuerySchema = z.object({
    status: z.enum(['all', 'active', 'removed']).default('active'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

// Invite body requires `roleId` so the admin picks the role up
// front. The role's perm array drives every staff-level check
// downstream.
export const inviteInstructorSchema = z.object({
    firstName: z.string().trim().min(2).max(50),
    lastName: z.string().trim().min(2).max(50),
    email: z.string().trim().email(),
    roleId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid role id'),
    note: z.string().trim().max(500).optional(),
})

export type InviteInstructorInput = z.infer<typeof inviteInstructorSchema>
export type UpdateInstructorInput = z.infer<typeof updateInstructorSchema>
export type ListInstructorsQuery = z.infer<typeof listInstructorsQuerySchema>

// Public (no auth) — the staff member clicks the confirm link
// in the first email. This is the first of two steps; once
// confirmed, the second email (with the setup link) is sent.
export const confirmInstructorInviteSchema = z.object({
    inviteId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid invite id'),
    token: z.string().min(20).max(200),
})

// Public (no auth) — the staff member clicks the setup link,
// sets a password, and the invite flips to accepted + the staff
// membership is activated. Server-side we hash-compare the
// setup token + the confirm must have happened first.
export const acceptInstructorInviteSchema = z.object({
    inviteId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid invite id'),
    token: z.string().min(20).max(200),
    newPassword: z.string().min(8).max(128),
    firstName: z.string().trim().min(2).max(50).optional(),
    lastName: z.string().trim().min(2).max(50).optional(),
})

export type ConfirmInstructorInviteInput = z.infer<typeof confirmInstructorInviteSchema>
export type AcceptInstructorInviteInput = z.infer<typeof acceptInstructorInviteSchema>