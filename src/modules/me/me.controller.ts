// Phase 19 / "My permissions" controller.
//
// One-call endpoint for the front-end to discover what the
// currently-logged-in user can do at every company they're
// associated with. Mounted at /me (so the full path is
// /api/v1/me/permissions).
//
// Auth: any logged-in user. We deliberately don't gate on
// COMPANY_OWNER / COMPANY_INSTRUCTOR / etc. — students with no
// staff memberships get a `{ companies: [] }` response back,
// which is still a valid answer ("you're not staff anywhere").
import { Router } from "express"
import { auth } from "../../middleware/authentication.middleware"
import { meService } from "./me.service"

const router = Router()

/**
 * @swagger
 * /me/permissions:
 *   get:
 *     summary: Get the current user's role + permissions across every company they're associated with
 *     description: |
 *       One-call answer to "what can I do?". Returns:
 *         - The user's global role (e.g. `company_instructor`).
 *         - For each company the user is associated with (via
 *           `staffMembership[]` active, or via `Company.createdBy`
 *           for owners), the company name, their role at that
 *           company, and the effective `effectivePermissions`
 *           array.
 *
 *       Owner case: a user where `Company.createdBy === user._id`
 *       is the company owner and gets every permission implicitly.
 *       We expand that to `effectivePermissions: all 26 keys` so
 *       the front-end doesn't have to special-case the owner.
 *
 *       Active-only: soft-revoked staff and removed memberships
 *       don't surface here. Removed staff see the company in
 *       `User.staffMembership[]` (audit trail) but not in this
 *       endpoint.
 *
 *       Caching: live DB read. Per-user, low-traffic. A stale
 *       "you're staff" state on a just-revoked user would let
 *       them keep acting for the 30s window — not worth the
 *       complexity of a cache here. The two queries (User +
 *       Company $in) are sub-millisecond.
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Permissions fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     role:
 *                       type: string
 *                       example: company_instructor
 *                     companies:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           companyId: { type: string }
 *                           companyName: { type: string }
 *                           companyLogo:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               public_id: { type: string }
 *                               secure_url: { type: string }
 *                           isOwner: { type: boolean }
 *                           membership:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               status: { type: string, example: active }
 *                               joinedAt: { type: string, format: date-time }
 *                               removedAt: { type: string, format: date-time, nullable: true }
 *                           role:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               _id: { type: string }
 *                               name: { type: string, example: HR Lead }
 *                               description: { type: string, nullable: true }
 *                               isSystem: { type: boolean }
 *                               isOwnerRole: { type: boolean }
 *                               permissions:
 *                                 type: array
 *                                 items: { type: string }
 *                                 example: ["applicants.read", "applicants.review", "interns.read"]
 *                           effectivePermissions:
 *                             type: array
 *                             items: { type: string }
 *                             description: |
 *                               The full list of permission keys the
 *                               user can act on at this company.
 *                               For owners, this is every key in
 *                               the registry. For staff, this is
 *                               the role's permission array.
 *                 msg: { type: string }
 *       401: { description: Not authenticated }
 */
router.get('/permissions', auth(), meService.permissions)

export { router as meRouter }
