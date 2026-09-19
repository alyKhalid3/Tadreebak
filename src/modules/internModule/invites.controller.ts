// Internship Invites — admin-side controller.
//
// Mounted inside the existing `internCompanyRouter` (the
// merged-params router at `/company/:companyId/internships`)
// via `router.use('/:internId/invites', invitesRouter)`.
// `mergeParams: true` so we see `:companyId` from the parent
// mount and `:internId` from the segment registered here.
//
// Role guard: COMPANY_OWNER only. `assertOwnedCompany` inside
// the service is the real cross-company gate.

import { Router } from "express"
import { validation } from "../../middleware/validation.middleware"
import { auth } from "../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../DB/types/user.type"
import { InvitesService } from "./invites.service"
import * as InvitesValidation from "./invites.validation"

const invitesService = new InvitesService()
const invitesRouter = Router({ mergeParams: true })

invitesRouter.use(auth(), AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]))

/**
 * @swagger
 * /company/{companyId}/internships/{internId}/invites:
 *   post:
 *     summary: Invite a student to an internship
 *     description: |
 *       Admin-only. Fires a `pending` invite; the student can still
 *       apply through the normal `POST /applications` path. The
 *       student-side accept / decline flow is deferred — see
 *       BACKEND_GAPS_EN §4.
 *
 *       `409` if the same `(internshipId, studentId)` pair is
 *       already invited (unique index surfaces a clean error).
 *     tags: [Dashboard - Internships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: internId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateInternshipInvite' }
 *     responses:
 *       201:
 *         description: Invite created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     invite: { $ref: '#/components/schemas/InternshipInviteShort' }
 *                 msg: { type: string }
 *       400:
 *         description: Invalid id / internship is closed
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Internship or student not found
 *       409:
 *         description: Student already invited to this internship
 */
invitesRouter.post(
    '/',
    validation(InvitesValidation.internIdParamSchema, 'params'),
    validation(InvitesValidation.createInviteSchema),
    invitesService.create,
)

/**
 * @swagger
 * /company/{companyId}/internships/{internId}/invites:
 *   get:
 *     summary: List invites for an internship
 *     description: |
 *       Returns every invite (any status) for the internship in
 *       the path, newest first. Pagination supported.
 *     tags: [Dashboard - Internships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: internId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, accepted, declined, revoked]
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Invites fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     invites:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/InternshipInvite' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *                 msg: { type: string }
 *       400:
 *         description: Invalid id
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Internship not found
 */
invitesRouter.get(
    '/',
    validation(InvitesValidation.internIdParamSchema, 'params'),
    validation(InvitesValidation.listInvitesQuerySchema, 'query'),
    invitesService.list,
)

/**
 * @swagger
 * /company/{companyId}/internships/{internId}/invites/{inviteId}:
 *   delete:
 *     summary: Revoke an invite
 *     description: |
 *       Soft-revokes by flipping `status` to `revoked`. The row
 *       stays in the DB so the audit history (who invited, when)
 *       is preserved. Use a separate cleanup task later if the
 *       collection grows unbounded.
 *     tags: [Dashboard - Internships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: internId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invite revoked
 *       400:
 *         description: Invalid id
 *       403:
 *         description: Caller does not own the company
 *       404:
 *         description: Invite not found
 */
invitesRouter.delete(
    '/:inviteId',
    validation(InvitesValidation.inviteIdParamSchema, 'params'),
    invitesService.revoke,
)

/**
 * @swagger
 * components:
 *   schemas:
 *     InternshipInvite:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         companyId: { type: string }
 *         internshipId: { type: string }
 *         studentId: { type: string }
 *         invitedBy: { type: string }
 *         status:
 *           type: string
 *           enum: [pending, accepted, declined, revoked]
 *         note: { type: string, nullable: true, maxLength: 500 }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     InternshipInviteShort:
 *       type: object
 *       description: 'Lightweight response shape returned by POST. Matches the BACKEND_GAPS_EN wire contract.'
 *       properties:
 *         _id: { type: string }
 *         status:
 *           type: string
 *           enum: [pending, accepted, declined, revoked]
 *         createdAt: { type: string, format: date-time }
 *
 *     CreateInternshipInvite:
 *       type: object
 *       required: [studentId]
 *       properties:
 *         studentId:
 *           type: string
 *           description: 24-char ObjectId of the student to invite.
 *         note:
 *           type: string
 *           maxLength: 500
 *           description: Optional short message the admin can attach to the invite.
 */

export { invitesRouter }
