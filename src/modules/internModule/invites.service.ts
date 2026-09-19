// Internship Invites — admin-side service.
//
// Today only the admin side is wired (POST / GET / DELETE). The
// student-side accept / decline flow is deferred per
// BACKEND_GAPS_EN §4 but the schema status enum already carries
// the future states so no migration is needed when it ships.

import { NextFunction, Request, Response } from "express"
import mongoose, { isObjectIdOrHexString } from "mongoose"
import { InternshipInviteModel } from "../../DB/models/internshipInvite.model"
import { InternShipModel } from "../../DB/models/internship.model"
import { UserModel } from "../../DB/models/user.model"
import { InternshipInviteStatus } from "../../DB/types/internshipInvite.type"
import { UserRoleEnum } from "../../DB/types/user.type"
import { assertOwnedCompany } from "../../utils/companyAccess"
import { ApplicationError, NotFoundException } from "../../utils/error"
import { successHandler } from "../../utils/successHandler"
import { cacheWrap, cacheFlushPrefix } from "../../cache/cache"

// Cache key conventions
// -------------------
// `invites:list:{internId}:{queryHash}`  — list endpoint
// Mutations flush the prefix `invites:{internId}` so a single
// cacheFlushPrefix call covers every read path.

const INTERN_KEY = (internId: string) => `invites:${internId}`

export class InvitesService {
    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, internId } = req.params
            const user = res.locals.user
            if (!isObjectIdOrHexString(companyId) || !isObjectIdOrHexString(internId)) {
                throw new ApplicationError('Invalid id', 400)
            }
            await assertOwnedCompany(companyId as string, user._id.toString())

            const { studentId, note } = req.body as {
                studentId: string
                note?: string
            }

            // Verify the internship belongs to the company in the
            // path. Without this check, an admin could invite a
            // student to another company's internship using only
            // the internship id.
            const internship = await InternShipModel.findById(internId as string).lean()
            if (!internship) {
                throw new NotFoundException('Internship not found')
            }
            if (internship.companyId.toString() !== companyId) {
                throw new NotFoundException('Internship not found')
            }
            if (internship.closed) {
                throw new ApplicationError('Internship is closed', 400)
            }

            // The student must exist. We don't gate on role here —
            // a company might invite a `user` who hasn't yet
            // switched to `student`, that's a valid flow.
            const student = await UserModel.findById(studentId).select('_id').lean()
            if (!student) {
                throw new NotFoundException('Student not found')
            }

            try {
                const invite = await InternshipInviteModel.create({
                    companyId: new mongoose.Types.ObjectId(companyId as string),
                    internshipId: new mongoose.Types.ObjectId(internId as string),
                    studentId: new mongoose.Types.ObjectId(studentId),
                    invitedBy: user._id,
                    status: InternshipInviteStatus.PENDING,
                    ...(note ? { note } : {}),
                })

                await cacheFlushPrefix(INTERN_KEY(internId as string))

                return successHandler({
                    res,
                    status: 201,
                    message: 'ok',
                    data: {
                        invite: {
                            _id: invite._id,
                            status: invite.status,
                            createdAt: invite.createdAt,
                        },
                    },
                })
            } catch (err: any) {
                // Duplicate (internshipId, studentId) — surface a
                // clean 409 instead of a 500 from the unique index.
                if (err && err.code === 11000) {
                    throw new ApplicationError(
                        'This student has already been invited to this internship',
                        409,
                    )
                }
                throw err
            }
        } catch (error) {
            next(error)
        }
    }

    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, internId } = req.params
            if (!isObjectIdOrHexString(companyId) || !isObjectIdOrHexString(internId)) {
                throw new ApplicationError('Invalid id', 400)
            }
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            // Verify the internship belongs to this company
            // (defense-in-depth — `assertOwnedCompany` already
            // 403s cross-company writes; this also rejects a
            // bogus :internId that lives at a different company).
            const internship = await InternShipModel.findById(internId as string)
                .select('_id companyId')
                .lean()
            if (!internship || internship.companyId.toString() !== companyId) {
                throw new NotFoundException('Internship not found')
            }

            const { status, page, limit } = req.query as {
                status?: string
                page?: number
                limit?: number
            }

            const cacheKey = `invites:list:${internId}:${JSON.stringify({ status, page, limit })}`
            const data = await cacheWrap(cacheKey, 60, async () => {
                const filter: Record<string, any> = { internshipId: new mongoose.Types.ObjectId(internId as string) }
                if (status) filter.status = status

                const skip = ((page ?? 1) - 1) * (limit ?? 20)
                const [invites, total] = await Promise.all([
                    InternshipInviteModel.find(filter)
                        .sort({ createdAt: -1 })
                        .skip(skip)
                        .limit(limit ?? 20)
                        .lean(),
                    InternshipInviteModel.countDocuments(filter),
                ])
                return {
                    invites,
                    pagination: { page: page ?? 1, limit: limit ?? 20, total },
                }
            })

            return successHandler({ res, message: 'ok', data })
        } catch (error) {
            next(error)
        }
    }

    revoke = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, internId, inviteId } = req.params
            if (
                !isObjectIdOrHexString(companyId) ||
                !isObjectIdOrHexString(internId) ||
                !isObjectIdOrHexString(inviteId)
            ) {
                throw new ApplicationError('Invalid id', 400)
            }
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            // Find the invite first to scope it to (internship,
            // company) — without the company filter, a stolen
            // inviteId from another company could be revoked here.
            const existing = await InternshipInviteModel.findOne({
                _id: new mongoose.Types.ObjectId(inviteId as string),
                internshipId: new mongoose.Types.ObjectId(internId as string),
            })
            if (!existing) {
                throw new NotFoundException('Invite not found')
            }
            if (existing.companyId.toString() !== companyId) {
                throw new NotFoundException('Invite not found')
            }

            await InternshipInviteModel.updateOne(
                { _id: existing._id },
                { $set: { status: InternshipInviteStatus.REVOKED } },
            )

            await cacheFlushPrefix(INTERN_KEY(internId as string))

            return successHandler({ res, message: 'Invite revoked' })
        } catch (error) {
            next(error)
        }
    }
}

// Internal: ensure the role enum doesn't drift in case someone
// later gates this further (today every auth'd user can hit the
// endpoints — `assertOwnedCompany` is the real gate).
export const __inviteRoles = UserRoleEnum
