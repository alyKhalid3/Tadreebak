// Phase 18 / Company staff / Instructor controller.
//
// Owner-only admin endpoints mounted at `/company/:companyId/instructors`.
// Each route uses `assertOwnedCompany` — instructors themselves can't
// invite other instructors; only the company owner.
//
// `acceptInvite` is the only public (no-auth) endpoint in this
// module — it lives at `/instructor-auth/accept-invite` so the URL
// shape signals "this is the claim-account flow".
import { Router } from "express"
import { auth } from "../../../middleware/authentication.middleware"
import { validation } from "../../../middleware/validation.middleware"
import { instructorsService } from "./instructors.service"
import {
    acceptInstructorInviteSchema,
    confirmInstructorInviteSchema,
    inviteInstructorSchema,
    listInstructorsQuerySchema,
    updateInstructorSchema,
} from "./instructors.validation"

// Admin-side router — merged params so :companyId comes from the
// parent mount (`/company/:companyId/instructors`).
const router = Router({ mergeParams: true })

/**
 * @swagger
 * /company/{companyId}/instructors:
 *   post:
 *     summary: Invite an instructor by email (owner only)
 *     description: |
 *       Sends a one-time setup link to the given address. If a user
 *       with that email already exists, they're promoted to
 *       COMPANY_INSTRUCTOR (with safety checks — active STUDENTs
 *       must withdraw first). Otherwise a placeholder user is
 *       created and they set their password via the link.
 *     tags: [Instructors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/InviteInstructor' }
 *     responses:
 *       201: { description: Invite sent }
 *       400: { description: Self-invite / role conflict }
 *       403: { description: Not the company owner }
 *       404: { description: Company not found }
 *       409: { description: Already an instructor at this company }
 */
router.post(
    '/',
    auth(),
    validation(inviteInstructorSchema),
    instructorsService.invite,
)

/**
 * @swagger
 * /company/{companyId}/instructors:
 *   get:
 *     summary: List instructors for the company (owner only)
 *     tags: [Instructors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [all, active, removed], default: active }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: Instructors listed }
 *       403: { description: Not the company owner }
 */
router.get(
    '/',
    auth(),
    validation(listInstructorsQuerySchema, 'query'),
    instructorsService.list,
)

/**
 * @swagger
 * /company/{companyId}/instructors/{userId}:
 *   patch:
 *     summary: Rename an instructor (owner only)
 *     tags: [Instructors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string, minLength: 2, maxLength: 50 }
 *               lastName: { type: string, minLength: 2, maxLength: 50 }
 *     responses:
 *       200: { description: Updated }
 *       403: { description: Not the company owner }
 *       404: { description: Instructor not found at this company }
 */
router.patch(
    '/:userId',
    auth(),
    validation(updateInstructorSchema),
    instructorsService.update,
)

/**
 * @swagger
 * /company/{companyId}/instructors/{userId}:
 *   delete:
 *     summary: Soft-revoke an instructor (owner only)
 *     description: |
 *       Sets `instructorStatus: 'removed'` on the user and pulls
 *       them from `Company.instructors[]`. Their historical actions
 *       keep their name attached (we don't rewrite audit logs).
 *     tags: [Instructors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Removed }
 *       403: { description: Not the company owner }
 *       404: { description: Instructor not found at this company }
 */
router.delete(
    '/:userId',
    auth(),
    instructorsService.remove,
)

/**
 * @swagger
 * /company/{companyId}/instructors/{userId}/resend-invite:
 *   post:
 *     summary: Resend the setup email to an instructor (owner only)
 *     tags: [Instructors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Invite resent }
 *       403: { description: Not the company owner }
 *       404: { description: Instructor not found at this company }
 */
router.post(
    '/:userId/resend-invite',
    auth(),
    instructorsService.resendInvite,
)

export { router as instructorsRouter }

// Public (no-auth) router for the claim-account flow. Mounted
// separately at `/instructor-auth/accept-invite` so the URL shape
// signals "this isn't behind the company gate". The body has the
// raw token; we hash + timing-safe-compare against the stored hash.
const publicRouter = Router()

/**
 * @swagger
 * /instructor-auth/accept-invite:
 *   post:
 *     summary: Accept an instructor invite and set a password (public)
 *     description: |
 *       The instructor clicks the link in the invite email, lands
 *       on `/instructor-setup?token=...&invite=...`, sets a password,
 *       and the server flips the invite row to `accepted`. The
 *       token in the email is one-time — it's nullified on the row
 *       after a successful accept.
 *     tags: [Instructors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AcceptInstructorInvite' }
 *     responses:
 *       200: { description: Instructor account activated }
 *       400: { description: Invalid invite id / token / expired / password }
 *       404: { description: Invite / instructor not found }
 */
publicRouter.post(
    '/accept-invite',
    validation(acceptInstructorInviteSchema),
    instructorsService.acceptInvite,
)

/**
 * @swagger
 * /instructor-auth/confirm-invite:
 *   post:
 *     summary: Confirm a staff invitation and trigger the setup email
 *     description: |
 *       Public, no auth. The recipient clicks the link in the
 *       **first** invite email; this endpoint validates the
 *       confirm token, marks the invite as confirmed, mints a
 *       fresh setup token, and emails the recipient the
 *       password-setup link. This is the first step of the
 *       two-step accept flow (security model in
 *       `docs/EMAIL_INVITE_SECURITY.md`).
 *     tags: [Instructors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ConfirmInstructorInvite' }
 *     responses:
 *       200: { description: Invitation confirmed; setup email sent }
 *       400: { description: Invalid / expired / already-used token }
 *       404: { description: Invite not found }
 */
publicRouter.post(
    '/confirm-invite',
    validation(confirmInstructorInviteSchema),
    instructorsService.confirmInvite,
)

export { publicRouter as instructorAuthRouter }

/**
 * @swagger
 * components:
 *   schemas:
 *     InviteInstructor:
 *       type: object
 *       required: [firstName, lastName, email]
 *       properties:
 *         firstName: { type: string, minLength: 2, maxLength: 50 }
 *         lastName: { type: string, minLength: 2, maxLength: 50 }
 *         email: { type: string, format: email }
 *         note: { type: string, maxLength: 500, description: 'Optional short note shown in the invite email.' }
 *
 *     Instructor:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         firstName: { type: string }
 *         lastName: { type: string }
 *         email: { type: string, format: email }
 *         role:
 *           type: string
 *           enum: [company_instructor]
 *         companyAffiliation: { type: string }
 *         instructorStatus:
 *           type: string
 *           enum: [active, removed]
 *         instructorRemovedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt: { type: string, format: date-time }
 *
 *     AcceptInstructorInvite:
 *       type: object
 *       required: [inviteId, token, newPassword]
 *       properties:
 *         inviteId: { type: string, description: '24-char ObjectId from the invite URL.' }
 *         token: { type: string, description: 'Raw setup token from the email body.' }
 *         newPassword: { type: string, minLength: 8, maxLength: 128 }
 *         firstName: { type: string, minLength: 2, maxLength: 50 }
 *         lastName: { type: string, minLength: 2, maxLength: 50 }
 *
 *     ConfirmInstructorInvite:
 *       type: object
 *       required: [inviteId, token]
 *       properties:
 *         inviteId: { type: string, description: '24-char ObjectId from the confirm URL.' }
 *         token: { type: string, description: 'Raw confirm token from the first email body.' }
 */