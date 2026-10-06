// Phase 5 — intern self-service, multi-company.
//
// Two-level navigation:
//   GET /intern/me                  → list of all my enrollments (picker)
//   GET /intern/me/:companyId        → per-company view (profile + program +
//                                       project + taskCounts + enrollment meta)
//
// The other intern-side endpoints (program / supervisor / attendance /
// tasks / evaluations) all take :companyId in the path so the intern
// can never see Company Y's data while viewing Company X.
//
// Cache strategy: the picker is cached per-user (30s); each per-
// company view is cached per (user, company) pair (30s). Mutations
// (accept by the company) flush `intern:me:{userId}` and
// `intern:me:{userId}:{companyId}`.

import { NextFunction, Request, Response } from "express"
import mongoose, { Types } from "mongoose"
import { UserModel } from "../../../DB/models/user.model"
import { ProgramModel } from "../../../DB/models/program.model"
import { ProjectModel } from "../../../DB/models/project.model"
import { companyModel } from "../../../DB/models/company.model"
import { TaskModel } from "../../../DB/models/task.model"
import { AttendanceRepo } from "../../../DB/repos/attendance.repo"
import { ProgramStatus } from "../../../DB/types/program.type"
import { ProjectStatus } from "../../../DB/types/project.type"
import { UserRoleEnum } from "../../../DB/types/user.type"
import { TaskStatus } from "../../../DB/types/task.type"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { cacheFlushPrefix, cacheWrap } from "../../../cache/cache"
import { toSafeUser } from "../../../utils/safeUser"
import {
    findActiveEnrollmentAt,
    hasActiveEnrollmentAt,
    projectEnrollment,
} from "../../../utils/enrollment"

const attendanceRepo = new AttendanceRepo()

const findCurrentProgram = async (internId: string, companyId: string) => {
    return cacheWrap(`intern:me:program:${internId}:${companyId}`, 30, async () => {
        const active = await ProgramModel.findOne({
            companyId: new Types.ObjectId(companyId),
            internIds: new Types.ObjectId(internId),
            status: ProgramStatus.ACTIVE,
        }).lean()
        if (active) return active
        return ProgramModel.findOne({
            companyId: new Types.ObjectId(companyId),
            internIds: new Types.ObjectId(internId),
        })
            .sort({ createdAt: -1 })
            .lean()
    })
}

const findCurrentProject = async (internId: string, companyId: string) => {
    return cacheWrap(`intern:me:project:${internId}:${companyId}`, 30, async () => {
        const active = await ProjectModel.findOne({
            companyId: new Types.ObjectId(companyId),
            internIds: new Types.ObjectId(internId),
            status: ProjectStatus.ACTIVE,
        }).lean()
        if (active) return active
        return ProjectModel.findOne({
            companyId: new Types.ObjectId(companyId),
            internIds: new Types.ObjectId(internId),
        })
            .sort({ createdAt: -1 })
            .lean()
    })
}

export class InternMeService {
    // ----- Picker: list all my enrollments -----
    me = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const userId = user._id.toString()
            const enrollments = user.enrollments ?? []

            // The picker needs the company names + logos, so we
            // hydrate them. Cache 30s.
            const cacheKey = `intern:enrollments:${userId}`
            const data = await cacheWrap(cacheKey, 30, async () => {
                const companyIds = enrollments.map((e: any) => e.companyId)
                const companies = companyIds.length
                    ? await companyModel
                          .find(
                              { _id: { $in: companyIds } },
                              { name: 1, logo: 1, industry: 1 },
                          )
                          .lean()
                    : []
                const byId = new Map(
                    companies.map((c: any) => [c._id.toString(), c]),
                )
                const projection = (e: any) => {
                    const c: any = byId.get(e.companyId.toString())
                    return {
                        ...projectEnrollment(e),
                        company: c
                            ? { _id: c._id, name: c.name, logo: c.logo, industry: c.industry }
                            : null,
                    }
                }
                return enrollments.map((e: any) => {
                    const c: any = byId.get(e.companyId.toString())
                    return {
                        ...projectEnrollment(e),
                        company: c
                            ? { _id: c._id, name: c.name, logo: c.logo, industry: c.industry }
                            : null,
                    }
                })
            })

            return successHandler({
                res,
                message: "My enrollments fetched successfully",
                data: {
                    enrollments: data,
                    profile: toSafeUser(user),
                },
            })
        } catch (error) {
            next(error)
        }
    }

    // ----- Per-company view -----
    meByCompany = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const userId = user._id.toString()
            const companyId = req.params.companyId as string

            // Defense in depth: the intern must have an ACTIVE
            // enrollment at this company. requireIntern only checks
            // "any active enrollment"; this endpoint scopes to one.
            if (!hasActiveEnrollmentAt(user, companyId)) {
                throw new NotFoundException(
                    "You are not enrolled at this company",
                )
            }

            const cacheKey = `intern:me:${userId}:${companyId}`
            const data = await cacheWrap(cacheKey, 30, async () => {
                const [program, project, taskCounts] = await Promise.all([
                    findCurrentProgram(userId, companyId),
                    findCurrentProject(userId, companyId),
                    TaskModel.aggregate<{ _id: string; count: number }>([
                        {
                            $match: {
                                internId: new Types.ObjectId(userId),
                                companyId: new Types.ObjectId(companyId),
                                status: { $ne: TaskStatus.ARCHIVED },
                            },
                        },
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 },
                            },
                        },
                    ]),
                ])
                const counts: Record<string, number> = {
                    todo: 0,
                    in_progress: 0,
                    in_review: 0,
                    complete: 0,
                }
                for (const row of taskCounts) {
                    counts[row._id] = row.count
                }
                const enrollment = findActiveEnrollmentAt(user, companyId)
                return {
                    profile: toSafeUser(user),
                    program: program ?? null,
                    project: project ?? null,
                    taskCounts: counts,
                    enrollment: enrollment
                        ? {
                              enrolledAt: enrollment.enrolledAt,
                              internshipStartDate: enrollment.internshipStartDate,
                              internshipEndDate: enrollment.internshipEndDate,
                              totalPoints: enrollment.totalPoints,
                          }
                        : null,
                }
            })

            return successHandler({
                res,
                message: "My profile fetched successfully",
                data,
            })
        } catch (error) {
            next(error)
        }
    }

    // ----- Per-company: program -----
    program = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const userId = user._id.toString()
            const companyId = req.params.companyId as string
            if (!hasActiveEnrollmentAt(user, companyId)) {
                throw new NotFoundException(
                    "You are not enrolled at this company",
                )
            }
            const program = await findCurrentProgram(userId, companyId)
            if (!program) throw new NotFoundException("No program found for your enrollment")
            return successHandler({
                res,
                message: "Current program fetched successfully",
                data: { program },
            })
        } catch (error) {
            next(error)
        }
    }

    // ----- Per-company: supervisor -----
    // Phase 18B: returns `{ owner, staffMembers[] }` where each
    // staff member carries their role name. The `owner` slot is
    // the company creator. The `staffMembers` slot is the active
    // staff roster (excludes soft-revoked) — filter on the live
    // `staffMembership.status === 'active'` rather than the mirror
    // copy so a mid-flush revoke doesn't surface a removed person.
    supervisor = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const companyId = req.params.companyId as string
            if (!hasActiveEnrollmentAt(user, companyId)) {
                throw new NotFoundException(
                    "You are not enrolled at this company",
                )
            }
            const company: any = await companyModel
                .findOne({ _id: companyId }, { name: 1, logo: 1, createdBy: 1, staffMembers: 1 })
                .populate("createdBy", "firstName lastName email profilePicture phoneNumber")
                .lean()
            if (!company) throw new NotFoundException("Company not found")

            // Active-only: soft-revoked staff should not surface
            // as supervisors. We filter on the live User fields
            // (staffMembership.status === 'active') rather than the
            // mirror copy so a soft-revoke that's mid-flush can't
            // surface a removed person.
            const staffIds: Types.ObjectId[] = (company.staffMembers ?? []).map(
                (id: Types.ObjectId) => id,
            )
            const activeStaff = staffIds.length === 0
                ? []
                : await UserModel.find({
                      _id: { $in: staffIds },
                      role: UserRoleEnum.COMPANY_INSTRUCTOR,
                      'staffMembership': {
                          $elemMatch: {
                              companyId: new mongoose.Types.ObjectId(companyId),
                              status: 'active',
                          },
                      },
                  })
                    .select('firstName lastName email profilePicture staffMembership')
                    .lean()

            // Resolve role names so the front-end can render
            // "Layla (Instructor)" without a follow-up request.
            const roleIds = Array.from(new Set(
                activeStaff
                    .flatMap((u) => u.staffMembership ?? [])
                    .map((m: any) => m.roleId?.toString())
                    .filter(Boolean) as string[],
            ))
            const roles = roleIds.length === 0 ? [] : await (await import("../../../DB/models/companyRole.model")).CompanyRoleModel
                .find({ _id: { $in: roleIds } })
                .select('name')
                .lean()
            const roleMap = new Map(roles.map((r: any) => [r._id.toString(), r.name]))

            const staffMembers = activeStaff.map((u) => {
                const m = (u.staffMembership ?? []).find(
                    (e: any) => e.companyId.toString() === companyId,
                )
                return {
                    _id: u._id,
                    firstName: u.firstName,
                    lastName: u.lastName,
                    email: u.email,
                    profilePicture: u.profilePicture,
                    role: m?.roleId
                        ? { _id: m.roleId, name: roleMap.get(m.roleId.toString()) ?? null }
                        : null,
                }
            })

            return successHandler({
                res,
                message: "Supervisor fetched successfully",
                data: {
                    company: { _id: company._id, name: company.name, logo: company.logo },
                    supervisor: {
                        owner: company.createdBy ?? null,
                        staffMembers,
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    // ----- Per-company: attendance history -----
    // (Phase 7 — the intern-side check-in was removed. The admin is
    // the source of truth for attendance; the intern just reads.)
    attendanceHistory = async (
        req: Request,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const user = res.locals.user
            const userId = user._id.toString()
            const companyId = req.params.companyId as string
            if (!hasActiveEnrollmentAt(user, companyId)) {
                throw new NotFoundException(
                    "You are not enrolled at this company",
                )
            }
            const { from, to, page = 1, limit = 20 } = req.query as {
                from?: string
                to?: string
                page?: number
                limit?: number
            }
            const filter: Record<string, any> = {
                internId: new Types.ObjectId(userId),
                companyId: new Types.ObjectId(companyId),
            }
            if (from || to) {
                filter.date = {}
                if (from) filter.date.$gte = from
                if (to) filter.date.$lte = to
            }
            const pageNum = page ?? 1
            const limitNum = limit ?? 20
            const skip = (pageNum - 1) * limitNum
            const [rows, total] = await Promise.all([
                attendanceRepo.find({
                    filter,
                    options: { skip, limit: limitNum, sort: { date: -1 } },
                }),
                (await import("../../../DB/models/attendance.model")).AttendanceModel.countDocuments(filter),
            ])
            return successHandler({
                res,
                message: "Attendance history fetched successfully",
                data: {
                    attendance: rows,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        pages: Math.ceil(total / limitNum),
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }
}
