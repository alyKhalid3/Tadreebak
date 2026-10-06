// Phase 18B / Staff (instructor) service.
//
// What the route names still say "instructor" but the underlying
// data is generic staff: any role from the CompanyRole collection
// can be assigned. The class is still named `InstructorsService`
// for now to keep the diff scoped; the URL path stays
// `/company/{companyId}/instructors` for the same reason. Future
// cleanup pass can rename the file + route consistently.
//
// Authorship flow (two-step, hardened per docs/EMAIL_INVITE_SECURITY.md):
//   1. Admin POSTs email + roleId + (optional) note → backend either
//      promotes an existing user (must NOT be an active STUDENT/INTERN
//      with a program) OR creates a placeholder user, mints two
//      tokens (confirm + setup) and emails the recipient the confirm
//      link.
//   2. Recipient clicks the confirm link → backend flips the invite
//      to `confirmed`, mints a fresh setup token, and emails the
//      setup link. (Two emails, two tokens — different secrets, only
//      the second one survives a successful accept.)
//   3. Recipient sets a password → we flip the invite to 'accepted',
//      activate the staff membership, and email the company owner
//      with "X just accepted your invite. If this wasn't X, click here
//      to revoke."
//
// Why two emails: if the recipient's email is compromised, the
// attacker needs to see BOTH emails to act. The first email has no
// useful payload without the second; the second is sent only after
// the recipient confirms. See docs/EMAIL_INVITE_SECURITY.md for the
// full threat model.

import { NextFunction, Request, Response } from "express"
import mongoose, { isObjectIdOrHexString } from "mongoose"
import crypto from "node:crypto"
import { InstructorInviteModel } from "../../../DB/models/instructorInvite.model"
import { companyModel } from "../../../DB/models/company.model"
import { UserModel } from "../../../DB/models/user.model"
import { CompanyRoleModel } from "../../../DB/models/companyRole.model"
import { InstructorInviteStatus } from "../../../DB/types/instructorInvite.type"
import { UserRoleEnum } from "../../../DB/types/user.type"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { cacheFlushPrefix, cacheDel } from "../../../cache/cache"
import { emailEmitter } from "../../../utils/sendEmail/emailEvents"
import { instructorInviteTemplate, instructorConfirmTemplate } from "../../../utils/sendEmail/generateHtml"
import { toSafeUser } from "../../../utils/safeUser"

// Cache keys
// ---------
// `staff:list:{companyId}:{queryHash}` — list endpoint (Phase 18B)
// We also bust `user:{userId}` whenever a membership changes
// status, so the auth middleware re-reads and the next request
// picks up the new role / revocation.
const STAFF_LIST_PREFIX = (companyId: string) => `staff:list:${companyId}`

// Token TTLs:
//   - Confirm token: 7 days. The recipient has a week to click
//     "confirm" before the invite goes stale.
//   - Setup token: 24 hours. Tighter — by the time the recipient
//     has confirmed, they're actively in front of the screen.
const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SETUP_TTL_MS = 24 * 60 * 60 * 1000

// Two separate token types so a leaked confirm token doesn't
// also let the attacker skip to setup.
const mintConfirmToken = (): { raw: string; hashed: string } => {
    const raw = crypto.randomBytes(32).toString("base64url")
    const hashed = crypto.createHash("sha256").update(raw).digest("hex")
    return { raw, hashed }
}
const mintSetupToken = (): { raw: string; hashed: string } => {
    const raw = crypto.randomBytes(32).toString("base64url")
    const hashed = crypto.createHash("sha256").update(raw).digest("hex")
    return { raw, hashed }
}

const buildSetupUrl = (setupToken: string, inviteId: string): string => {
    const frontendBase = process.env.FRONTEND_URL ?? 'http://localhost:3000'
    return `${frontendBase}/instructor-setup?token=${setupToken}&invite=${inviteId}`
}

const buildConfirmUrl = (confirmToken: string, inviteId: string): string => {
    const frontendBase = process.env.FRONTEND_URL ?? 'http://localhost:3000'
    return `${frontendBase}/instructor-confirm?token=${confirmToken}&invite=${inviteId}`
}

export class InstructorsService {
    /**
     * Invite a staff member by email + roleId. If the email
     * already exists, promote them; otherwise create a placeholder.
     * Emits the confirm email (with the confirm-token in the URL).
     */
    invite = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            const user = res.locals.user

            await assertOwnedCompany(companyId as string, user._id.toString())

            const { firstName, lastName, email, roleId, note } = req.body as {
                firstName: string
                lastName: string
                email: string
                roleId: string
                note?: string
            }
            const normalizedEmail = email.toLowerCase().trim()

            if (!isObjectIdOrHexString(roleId)) {
                throw new ApplicationError('Invalid role id', 400)
            }

            // The role must exist AND belong to this company.
            // Cross-company role-id injection: refused.
            const role = await CompanyRoleModel.findById(roleId)
            if (!role) throw new NotFoundException('Role not found')
            if (role.companyId.toString() !== companyId) {
                throw new NotFoundException('Role not found')
            }
            if (role.isOwnerRole) {
                throw new ApplicationError(
                    'The Owner role cannot be assigned to a staff member. The owner is the company creator',
                    400,
                )
            }

            // Self-invite — the admin can't invite themselves
            // (they're already the owner).
            if (normalizedEmail === user.email.toLowerCase()) {
                throw new ApplicationError(
                    "You are already the owner of this company",
                    400,
                )
            }

            // Look up the target user by email. Same role-conflict
            // checks as Phase 18: active student, owner, multi-
            // company instructor, admin — all refused with a
            // descriptive 4xx.
            const existing = await UserModel.findOne({ email: normalizedEmail })
            if (existing) {
                if (existing.role === UserRoleEnum.COMPANY_OWNER) {
                    throw new ApplicationError(
                        'This person owns another company and cannot be added as staff',
                        400,
                    )
                }
                if (existing.role === UserRoleEnum.STUDENT || existing.role === UserRoleEnum.INTERN) {
                    const hasActiveProgram = (existing.enrollments ?? []).some(
                        (e) => e.status === 'active',
                    )
                    if (hasActiveProgram) {
                        throw new ApplicationError(
                            'This person is an active student at another company. They must finish or withdraw from their program first',
                            400,
                        )
                    }
                }
                // For v1 we reject active staff at another company.
                // The array shape means a future v2 can allow it
                // by appending a new staffMembership entry.
                if (existing.role === UserRoleEnum.COMPANY_INSTRUCTOR) {
                    const activeAtThisCompany = (existing.staffMembership ?? []).some(
                        (e) => e.companyId.toString() === companyId && e.status === 'active',
                    )
                    if (activeAtThisCompany) {
                        throw new ApplicationError(
                            'This person is already an active staff member at your company',
                            409,
                        )
                    }
                    const activeAtOther = (existing.staffMembership ?? []).some(
                        (e) => e.status === 'active',
                    )
                    if (activeAtOther) {
                        throw new ApplicationError(
                            'This person is already an active staff member at another company. Multi-company affiliation isn\'t supported in v1',
                            409,
                        )
                    }
                }
                if (existing.role === UserRoleEnum.ADMIN) {
                    throw new ApplicationError(
                        'Admins cannot also be company staff',
                        400,
                    )
                }
            }

            const { raw: confirmTokenRaw } = mintConfirmToken()

            let instructorId: mongoose.Types.ObjectId
            if (existing) {
                existing.role = UserRoleEnum.COMPANY_INSTRUCTOR
                // Don't overwrite firstName/lastName on promotion —
                // profile fields are user-controlled. Admin can PATCH
                // the instructor later if a typo needs fixing.
                await existing.save()
                instructorId = existing._id
            } else {
                // Placeholder user — minimal profile, no password.
                // Bypass Mongoose hooks so the activation-email
                // post-save doesn't fire; the invite email is the
                // only "welcome" the staff should see.
                const created = await UserModel.collection.insertOne({
                    firstName,
                    lastName,
                    email: normalizedEmail,
                    role: UserRoleEnum.COMPANY_INSTRUCTOR,
                    isConfirmed: false,
                    provider: 'system',
                    emailOtp: { otp: null, expiresAt: null, attempts: 0 },
                    passwordOtp: { otp: null, expiresAt: null, attempts: 0 },
                    newEmailOtp: { otp: null, expiresAt: null, attempts: 0 },
                    profilePicture: { public_id: '', secure_url: '' },
                    coverPicture: { public_id: '', secure_url: '' },
                    resume: { public_id: '', secure_url: '' },
                    ratingCount: 0,
                    ratingSum: 0,
                    staffMembership: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                instructorId = created.insertedId as mongoose.Types.ObjectId
            }

            // Create the invite row. We store the confirm token
            // hash on the row; the raw token is only in the email.
            // The setup token is generated later, in `confirmInvite`,
            // so we don't write a setupTokenHash here.
            const invite = await InstructorInviteModel.create({
                companyId: new mongoose.Types.ObjectId(companyId as string),
                instructorId,
                email: normalizedEmail,
                invitedBy: user._id,
                roleId: role._id,
                status: InstructorInviteStatus.PENDING,
                ...(note ? { note } : {}),
                expiresAt: new Date(Date.now() + CONFIRM_TTL_MS),
                confirmTokenHash: crypto.createHash('sha256').update(confirmTokenRaw).digest('hex'),
            })

            const company = await companyModel.findById(companyId as string).lean()
            emailEmitter.publish('send-email-instructor-confirm', {
                to: normalizedEmail,
                subject: `Confirm your invitation to ${company?.name ?? 'a company'} on Tadreebak`,
                html: instructorConfirmTemplate({
                    name: `${firstName} ${lastName}`,
                    companyName: company?.name ?? 'the company',
                    inviterName: `${user.firstName} ${user.lastName}`,
                    roleName: role.name,
                    confirmUrl: buildConfirmUrl(confirmTokenRaw, invite._id.toString()),
                    subject: `Confirm your invitation to ${company?.name ?? 'a company'}`,
                }),
            })

            console.info(
                `[staff] companyId=${companyId} instructorId=${instructorId.toString()} email=${normalizedEmail} roleId=${roleId} invitedBy=${user._id.toString()} action=invite`,
            )

            await cacheFlushPrefix(STAFF_LIST_PREFIX(companyId as string))
            await cacheDel(`user:${instructorId.toString()}`)
            await cacheDel(`company:detail:${companyId}`)

            return successHandler({
                res,
                status: 201,
                message: 'Invite sent — recipient must confirm before they can set their password',
                data: {
                    invite: {
                        _id: invite._id,
                        email: normalizedEmail,
                        role: { _id: role._id, name: role.name },
                        status: invite.status,
                        expiresAt: invite.expiresAt,
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Public (no auth) — the recipient clicks the link in the
     * confirm email. We hash-compare the confirm token, mark
     * the invite as confirmed, mint a fresh setup token, and
     * email the setup link. Two emails, two tokens, two different
     * TTLs — the security model from docs/EMAIL_INVITE_SECURITY.md.
     */
    confirmInvite = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { inviteId, token } = req.body as {
                inviteId: string
                token: string
            }
            if (!isObjectIdOrHexString(inviteId)) {
                throw new ApplicationError('Invalid invite id', 400)
            }

            const invite = await InstructorInviteModel.findById(inviteId)
                .select('+confirmTokenHash +setupTokenHash')
            if (!invite) throw new NotFoundException('Invite not found')
            if (invite.status !== InstructorInviteStatus.PENDING) {
                throw new ApplicationError('This invite is no longer active', 400)
            }
            if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
                if (invite.status === InstructorInviteStatus.PENDING) {
                    invite.status = InstructorInviteStatus.EXPIRED
                    await invite.save()
                }
                throw new ApplicationError('This invite has expired', 400)
            }
            if (!invite.confirmTokenHash) {
                throw new ApplicationError('This invite has no valid confirm token', 400)
            }

            const incomingHash = crypto.createHash('sha256').update(token).digest('hex')
            const incomingBuf = Buffer.from(incomingHash, 'utf8')
            const storedBuf = Buffer.from(invite.confirmTokenHash, 'utf8')
            if (incomingBuf.length !== storedBuf.length || !crypto.timingSafeEqual(incomingBuf, storedBuf)) {
                throw new ApplicationError('Invalid confirm token', 400)
            }

            // Mint a fresh setup token. The old confirmTokenHash is
            // nulled so even a future leak doesn't enable a second
            // confirm step.
            const { raw: setupTokenRaw } = mintSetupToken()
            const setupTokenHash = crypto.createHash('sha256').update(setupTokenRaw).digest('hex')

            invite.confirmedAt = new Date()
            invite.confirmTokenHash = null
            invite.setupTokenHash = setupTokenHash
            // Reset the TTL on the new setup window — the user
            // has 24h from confirmation to set a password.
            invite.expiresAt = new Date(Date.now() + SETUP_TTL_MS)
            await invite.save()

            const user = await UserModel.findById(invite.instructorId).select('firstName').lean()
            const company = await companyModel.findById(invite.companyId.toString()).lean()
            emailEmitter.publish('send-email-instructor-invite', {
                to: invite.email,
                subject: `Set your password to join ${company?.name ?? 'a company'}`,
                html: instructorInviteTemplate({
                    name: `${user?.firstName ?? ''}`,
                    companyName: company?.name ?? 'the company',
                    inviterName: '',
                    setupUrl: buildSetupUrl(setupTokenRaw, invite._id.toString()),
                    subject: `Set your password to join ${company?.name ?? 'a company'}`,
                }),
            })

            return successHandler({
                res,
                message: 'Invitation confirmed. Check your email for the password-setup link',
                data: {
                    invite: {
                        _id: invite._id,
                        status: invite.status,
                        expiresAt: invite.expiresAt,
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Public (no auth) — the recipient clicks the setup link,
     * sets a password, and the server activates the staff
     * membership. The owner gets a "X just accepted" email
     * (Level 1 hardening — see docs/EMAIL_INVITE_SECURITY.md).
     */
    acceptInvite = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { inviteId, token, newPassword, firstName, lastName } = req.body as {
                inviteId: string
                token: string
                newPassword: string
                firstName?: string
                lastName?: string
            }

            if (!isObjectIdOrHexString(inviteId)) {
                throw new ApplicationError('Invalid invite id', 400)
            }

            const invite = await InstructorInviteModel.findById(inviteId).select('+setupTokenHash')
            if (!invite) throw new NotFoundException('Invite not found')
            if (invite.status !== InstructorInviteStatus.PENDING) {
                throw new ApplicationError('This invite is no longer active', 400)
            }
            if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
                if (invite.status === InstructorInviteStatus.PENDING) {
                    invite.status = InstructorInviteStatus.EXPIRED
                    await invite.save()
                }
                throw new ApplicationError(
                    'This invite has expired. Ask the company owner to send a new one',
                    400,
                )
            }
            if (!invite.setupTokenHash) {
                throw new ApplicationError(
                    'This invite has no valid setup token. The recipient must confirm the invitation first',
                    400,
                )
            }
            if (!invite.confirmedAt) {
                // Defense-in-depth — the accept endpoint expects a
                // confirmed invite. If somehow confirmInvite was
                // skipped, refuse.
                throw new ApplicationError(
                    'This invitation hasn\'t been confirmed yet. Check the first email for a "Confirm" link',
                    400,
                )
            }

            const incomingHash = crypto.createHash('sha256').update(token).digest('hex')
            const incomingBuf = Buffer.from(incomingHash, 'utf8')
            const storedBuf = Buffer.from(invite.setupTokenHash, 'utf8')
            if (incomingBuf.length !== storedBuf.length || !crypto.timingSafeEqual(incomingBuf, storedBuf)) {
                throw new ApplicationError('Invalid setup token', 400)
            }

            const user = await UserModel.findById(invite.instructorId)
            if (!user) throw new NotFoundException('Instructor account not found')
            if (user.role !== UserRoleEnum.COMPANY_INSTRUCTOR) {
                throw new ApplicationError('This user is no longer set up to be staff', 400)
            }

            if (firstName) user.firstName = firstName
            if (lastName) user.lastName = lastName
            user.password = newPassword
            user.isConfirmed = true

            // Activate the staff membership at the same time —
            // the staff is "live" the moment the password is set.
            // (Earlier Phase 18 design did this on confirm; the
            // tighter Phase 18B model is "active = has a password".)
            const existingMembership = (user.staffMembership ?? []).find(
                (e) => e.companyId.toString() === invite.companyId.toString(),
            )
            if (existingMembership) {
                existingMembership.status = 'active'
                existingMembership.roleId = invite.roleId
                existingMembership.removedAt = null
            } else {
                user.staffMembership = [
                    ...(user.staffMembership ?? []),
                    {
                        companyId: invite.companyId,
                        roleId: invite.roleId,
                        status: 'active' as const,
                        joinedAt: new Date(),
                        removedAt: null,
                    },
                ]
            }
            await user.save()

            // Flip the invite row to accepted. Null the token so
            // a future DB leak doesn't enable reuse.
            invite.status = InstructorInviteStatus.ACCEPTED
            invite.acceptedAt = new Date()
            invite.setupTokenHash = null
            await invite.save()

            // Mirror on Company.staffMembers[] for fast "list my
            // company's staff" queries. `$addToSet` is idempotent.
            await companyModel.updateOne(
                { _id: invite.companyId },
                { $addToSet: { staffMembers: user._id } },
            )

            // Owner-ping-on-accept (Level 1 hardening). The owner
            // gets an email with a one-click revoke link (the
            // existing soft-revoke endpoint). If they don't act
            // within minutes, the new staff is fully active.
            const company = await companyModel.findById(invite.companyId.toString())
                .select('name createdBy').lean()
            if (company) {
                const owner = await UserModel.findById(company.createdBy)
                    .select('email firstName')
                    .lean()
                if (owner) {
                    const frontendBase = process.env.FRONTEND_URL ?? 'http://localhost:3000'
                    const revokeUrl = `${frontendBase}/company/${company._id.toString()}/instructors/${user._id.toString()}`
                    emailEmitter.publish('send-email-owner-staff-accepted-ping', {
                        to: owner.email,
                        subject: `${user.firstName} ${user.lastName} just joined your team`,
                        html: ownerStaffAcceptedTemplate({
                            ownerName: owner.firstName,
                            staffName: `${user.firstName} ${user.lastName}`,
                            companyName: company.name,
                            revokeUrl,
                        }),
                    })
                }
            }

            await cacheDel(`user:${user._id.toString()}`)
            await cacheDel(`company:detail:${invite.companyId.toString()}`)

            return successHandler({
                res,
                message: 'Instructor account activated',
                data: { instructor: toSafeUser(user.toObject()) },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * List active (default) or removed staff for the company.
     * Joins the live User fields + the role name so the front-end
     * can show "Layla (Instructor)" without a follow-up request.
     */
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            const { status } = req.query as { status?: 'all' | 'active' | 'removed' }
            const filter: Record<string, any> = {
                'staffMembership.companyId': new mongoose.Types.ObjectId(companyId as string),
            }
            if (status === 'active') {
                filter['staffMembership.status'] = 'active'
            } else if (status === 'removed') {
                filter['staffMembership.status'] = 'removed'
            }

            const rawStaff = await UserModel.find(filter)
                .select('firstName lastName email role staffMembership createdAt')
                .sort({ createdAt: -1 })
                .lean()

            // Hydrate role names so the front-end can render
            // "Layla (Instructor)" in a single request.
            const roleIds = Array.from(new Set(
                rawStaff
                    .flatMap((u) => u.staffMembership ?? [])
                    .map((m) => m.roleId?.toString())
                    .filter(Boolean) as string[],
            ))
            const roles = roleIds.length === 0 ? [] : await CompanyRoleModel.find({ _id: { $in: roleIds } })
                .select('name isSystem isOwnerRole')
                .lean()
            const roleMap = new Map(roles.map((r) => [r._id.toString(), r]))

            const staff = rawStaff.map((u) => {
                const m = (u.staffMembership ?? []).find(
                    (e) => e.companyId.toString() === companyId,
                )
                const role = m?.roleId ? roleMap.get(m.roleId.toString()) : null
                return {
                    ...toSafeUser(u),
                    membership: m
                        ? {
                              companyId: m.companyId,
                              roleId: m.roleId,
                              roleName: role?.name ?? null,
                              status: m.status,
                              joinedAt: m.joinedAt,
                              removedAt: m.removedAt,
                              isSystemRole: role?.isSystem ?? false,
                          }
                        : null,
                }
            })

            return successHandler({
                res,
                message: 'Staff fetched successfully',
                data: { staff },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Soft-revoke a staff member. Sets `status: 'removed'` on
     * the membership + records `removedAt`. The membership
     * record is KEPT (audit trail). The Company.staffMembers[]
     * mirror pulls the ref so "list active" no longer surfaces
     * them.
     */
    remove = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, userId } = req.params
            const user = res.locals.user

            if (!isObjectIdOrHexString(userId)) {
                throw new ApplicationError('Invalid user id', 400)
            }
            await assertOwnedCompany(companyId as string, user._id.toString())

            const target = await UserModel.findById(userId)
            if (!target) throw new NotFoundException('Staff member not found')

            const membership = (target.staffMembership ?? []).find(
                (e) => e.companyId.toString() === companyId && e.status === 'active',
            )
            if (!membership) {
                throw new NotFoundException('Staff member not found at this company')
            }
            membership.status = 'removed'
            membership.removedAt = new Date()
            await target.save()

            await companyModel.updateOne(
                { _id: new mongoose.Types.ObjectId(companyId as string) },
                { $pull: { staffMembers: target._id } },
            )

            // Flip any still-open invite rows to 'revoked' for
            // the audit log.
            await InstructorInviteModel.updateMany(
                {
                    companyId: new mongoose.Types.ObjectId(companyId as string),
                    instructorId: target._id,
                    status: InstructorInviteStatus.PENDING,
                },
                {
                    $set: {
                        status: InstructorInviteStatus.REVOKED,
                        revokedAt: new Date(),
                        revokedBy: user._id,
                    },
                },
            )

            console.info(
                `[staff] companyId=${companyId} instructorId=${userId} removedBy=${user._id.toString()} action=remove`,
            )

            await cacheFlushPrefix(STAFF_LIST_PREFIX(companyId as string))
            await cacheDel(`user:${userId}`)
            await cacheDel(`company:detail:${companyId}`)

            return successHandler({
                res,
                message: 'Staff member removed',
                data: { staff: toSafeUser(target.toObject()) },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Patch a staff member's display fields. We DON'T let the
     * admin change the email (security cross-the-wire change)
     * or the role via this endpoint — the role change is a
     * separate flow (Phase 18B follow-up if needed).
     */
    update = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, userId } = req.params
            const user = res.locals.user

            if (!isObjectIdOrHexString(userId)) {
                throw new ApplicationError('Invalid user id', 400)
            }
            await assertOwnedCompany(companyId as string, user._id.toString())

            const target = await UserModel.findById(userId)
            if (!target) throw new NotFoundException('Staff member not found')

            const membership = (target.staffMembership ?? []).find(
                (e) => e.companyId.toString() === companyId,
            )
            if (!membership) {
                throw new NotFoundException('Staff member not found at this company')
            }

            const { firstName, lastName } = req.body as { firstName?: string; lastName?: string }
            if (firstName !== undefined) target.firstName = firstName
            if (lastName !== undefined) target.lastName = lastName
            await target.save()

            await cacheDel(`user:${userId}`)
            await cacheFlushPrefix(STAFF_LIST_PREFIX(companyId as string))
            return successHandler({
                res,
                message: 'Staff member updated',
                data: { staff: toSafeUser(target.toObject()) },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Re-mint the confirm token + resend the invite email. Used
     * when the original email was lost / the 7-day TTL elapsed.
     */
    resendInvite = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, userId } = req.params
            const user = res.locals.user

            if (!isObjectIdOrHexString(userId)) {
                throw new ApplicationError('Invalid user id', 400)
            }
            await assertOwnedCompany(companyId as string, user._id.toString())

            const target = await UserModel.findById(userId)
            if (!target) throw new NotFoundException('Staff member not found')

            const membership = (target.staffMembership ?? []).find(
                (e) => e.companyId.toString() === companyId,
            )
            if (!membership) {
                throw new NotFoundException('Staff member not found at this company')
            }

            const { raw: confirmTokenRaw } = mintConfirmToken()
            const confirmTokenHash = crypto.createHash('sha256').update(confirmTokenRaw).digest('hex')

            // Cancel any open pending invite for this email at
            // this company before creating a fresh one. Otherwise
            // the partial-unique index would 409 the new row.
            await InstructorInviteModel.updateMany(
                {
                    companyId: new mongoose.Types.ObjectId(companyId as string),
                    instructorId: target._id,
                    status: InstructorInviteStatus.PENDING,
                },
                {
                    $set: { status: InstructorInviteStatus.REVOKED, revokedAt: new Date(), revokedBy: user._id },
                },
            )

            const invite = await InstructorInviteModel.create({
                companyId: new mongoose.Types.ObjectId(companyId as string),
                instructorId: target._id,
                email: target.email.toLowerCase(),
                invitedBy: user._id,
                roleId: membership.roleId,
                status: InstructorInviteStatus.PENDING,
                expiresAt: new Date(Date.now() + CONFIRM_TTL_MS),
                confirmTokenHash,
            })

            const company = await companyModel.findById(companyId as string).lean()
            const role = await CompanyRoleModel.findById(membership.roleId).lean()
            emailEmitter.publish('send-email-instructor-confirm', {
                to: target.email,
                subject: `Reminder: confirm your invitation to ${company?.name ?? 'a company'}`,
                html: instructorConfirmTemplate({
                    name: `${target.firstName} ${target.lastName}`,
                    companyName: company?.name ?? 'the company',
                    inviterName: `${user.firstName} ${user.lastName}`,
                    roleName: role?.name ?? 'staff',
                    confirmUrl: buildConfirmUrl(confirmTokenRaw, invite._id.toString()),
                    subject: `Reminder: confirm your invitation to ${company?.name ?? 'a company'}`,
                }),
            })

            return successHandler({
                res,
                message: 'Invite resent',
                data: { invite: { _id: invite._id, expiresAt: invite.expiresAt } },
            })
        } catch (error) {
            next(error)
        }
    }
}

export const instructorsService = new InstructorsService()

// Local template — defined here rather than in generateHtml.ts
// because it's specific to the owner-ping flow (a separate event
// from the staff invite). Keeps generateHtml.ts focused on the
// recipient-facing emails.
const ownerStaffAcceptedTemplate = ({
    staffName,
    companyName,
    revokeUrl,
}: {
    ownerName: string
    staffName: string
    companyName: string
    revokeUrl: string
}) => `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; padding: 16px;">
  <h2>New staff member at ${companyName}</h2>
  <p><strong>${staffName}</strong> just accepted their invitation and is now active as a staff member at ${companyName}.</p>
  <p>If you didn't authorize this, click below to revoke their access immediately:</p>
  <p><a href="${revokeUrl}" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Revoke access now</a></p>
  <p style="color:#666;font-size:13px;margin-top:24px;">This is a security alert. If you do recognize this acceptance, you can ignore this email.</p>
</body>
</html>`