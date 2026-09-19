// Internship Invites — wire validation.
//
// Three routes share this module:
//   - POST   /:internId/invites            — admin invites a student
//   - GET    /:internId/invites            — admin lists invites for one internship
//   - DELETE /:internId/invites/:inviteId  — admin revokes an invite
//
// The student-side accept / decline flow is deferred (see
// BACKEND_GAPS_EN §4 — "Optional, for later"). The status enum
// on the schema still has those values so we don't need a
// migration when the flow ships.

import { z } from "zod"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id")

export const internIdParamSchema = z.object({
    internId: objectId,
})

export const inviteIdParamSchema = z.object({
    internId: objectId,
    inviteId: objectId,
})

/**
 * Body for `POST /:internId/invites`. `studentId` is required;
 * `note` is an optional short message the admin can attach
 * ("we'd love your React skills", etc.). The internship id is
 * in the URL path, not the body.
 */
export const createInviteSchema = z.object({
    studentId: objectId,
    note: z.string().trim().min(1).max(500).optional(),
})

/**
 * List query — pagination + status filter.
 */
export const listInvitesQuerySchema = z.object({
    status: z
        .enum([
            'pending',
            'accepted',
            'declined',
            'revoked',
        ])
        .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})
