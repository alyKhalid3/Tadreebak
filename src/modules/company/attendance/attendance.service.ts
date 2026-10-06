// Phase 7 — company-side attendance (admin view + manual mark +
// schedule CRUD).
//
// Two responsibilities:
//   - Attendance rows (Phase 4): list + mark. Admin is now the
//     source of truth (the intern-side check-in was removed).
//     Date is interpreted in the company's timezone.
//   - Attendance schedule (Phase 7): the "required days" table
//     per-program with a company default. One schedule per
//     (companyId, programId) pair.
//
// Cache strategy:
//   - list → 30s (still 30s, unchanged from Phase 4)
//   - schedule (single doc) → 60s

import { NextFunction, Request, Response } from "express"
import { Types, isObjectIdOrHexString } from "mongoose"
import { AttendanceRepo } from "../../../DB/repos/attendance.repo"
import { AttendanceScheduleRepo } from "../../../DB/repos/attendanceSchedule.repo"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { assertStaffPermission } from "../../../utils/companyAccess"
import { cacheDel, cacheFlushPrefix, cacheWrap } from "../../../cache/cache"
import { UserModel } from "../../../DB/models/user.model"
import { companyModel } from "../../../DB/models/company.model"
import { ProgramModel } from "../../../DB/models/program.model"
import { AttendanceStatus } from "../../../DB/types/attendance.type"
import { IAttendanceSchedule } from "../../../DB/types/attendanceSchedule.type"
import { hasActiveEnrollmentAt } from "../../../utils/enrollment"
import { todayInTz } from "../../../utils/timezone"

const attendanceRepo = new AttendanceRepo()
const scheduleRepo = new AttendanceScheduleRepo()

// Read the company's timezone (or fall back to UTC) in one query.
// Used everywhere we compute "today" for date-window checks.
const getCompanyTz = async (companyId: string): Promise<string | undefined> => {
    const c = await companyModel
        .findById(companyId, { timezone: 1 })
        .lean()
    return c?.timezone
}

// Verify the program belongs to the company (when programId is set
// on the schedule). Throws NotFoundException if not.
const assertProgramInCompany = async (companyId: string, programId: string) => {
    const program = await ProgramModel.findOne(
        { _id: programId, companyId },
        { _id: 1 },
    ).lean()
    if (!program) throw new NotFoundException("Program not found at this company")
}

// Compute the YYYY-MM-DD N days ago, in the given TZ. Used to gate
// the "mark" endpoint to recent dates only (admin can correct
// records, not backfill history).
const ymdMinusDaysInTz = (days: number, tz?: string): string => {
    const ms = Date.now() - days * 24 * 60 * 60 * 1000
    // Use Intl with the target tz to format. The simple path: build
    // a Date at "now - N days" and format it in the target tz.
    const d = new Date(ms)
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz || "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")}`
}

export class AttendanceService {
    // ============================================================
    // Attendance rows (list + mark)
    // ============================================================

    // ---- List ----
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'attendance.mark')

            const {
                internId,
                date,
                from,
                to,
                status,
                page,
                limit,
            } = req.query as {
                internId?: string
                date?: string
                from?: string
                to?: string
                status?: AttendanceStatus
                page?: number
                limit?: number
            }

            const filter: Record<string, any> = {
                companyId: new Types.ObjectId(companyId),
            }
            if (internId) filter.internId = new Types.ObjectId(internId)
            if (status) filter.status = status
            if (date) {
                filter.date = date
            } else if (from || to) {
                filter.date = {}
                if (from) filter.date.$gte = from
                if (to) filter.date.$lte = to
            } else {
                // Default: last 30 days (in the company's TZ).
                const tz = await getCompanyTz(companyId)
                const today = todayInTz(tz)
                const thirtyAgo = ymdMinusDaysInTz(30, tz)
                filter.date = { $gte: thirtyAgo, $lte: today }
            }

            const pageNum = page ?? 1
            const limitNum = limit ?? 50
            const skip = (pageNum - 1) * limitNum

            const cacheKey = `attendance:list:${companyId}:${JSON.stringify({ internId, date, from, to, status, pageNum, limitNum })}`
            const { rows, total } = await cacheWrap(cacheKey, 30, async () => {
                const [items, totalCount] = await Promise.all([
                    attendanceRepo.find({
                        filter,
                        options: { skip, limit: limitNum, sort: { date: -1 } },
                    }),
                    (await import("../../../DB/models/attendance.model")).AttendanceModel.countDocuments(filter),
                ])
                return { rows: items, total: totalCount }
            })

            return successHandler({
                res,
                message: "Attendance fetched successfully",
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

    // ---- Manual mark (admin override) ----
    // Upsert by (internId, date). The unique compound index makes
    // this a one-round-trip operation; the E11000 race retry still
    // applies if two requests race to insert the same day.
    mark = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const internId = req.params.internId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'attendance.mark')

            if (!isObjectIdOrHexString(internId)) {
                throw new ApplicationError("Invalid intern id", 400)
            }
            // Phase 5: gate on the active enrollment at this company.
            const intern = await UserModel.findOne(
                { _id: new Types.ObjectId(internId) },
                { firstName: 1, lastName: 1, enrollments: 1 },
            ).lean()
            if (!intern) throw new NotFoundException("Intern not found")
            if (!hasActiveEnrollmentAt(intern, companyId)) {
                throw new ApplicationError(
                    "This user is not an active intern at this company",
                    400,
                )
            }

            const { date, status, note } = req.body as {
                date: string
                status: AttendanceStatus
                note?: string
            }

            // Date-window check (TZ-aware): can't mark more than 7
            // days in the past. Future-dated marks are allowed
            // (admin might pre-record an excused absence).
            const tz = await getCompanyTz(companyId)
            const sevenAgo = ymdMinusDaysInTz(7, tz)
            if (date < sevenAgo) {
                throw new ApplicationError(
                    "Cannot mark attendance more than 7 days in the past",
                    400,
                )
            }

            // Upsert on (internId, date). New rows start with
            // pointsAwarded: false so the (future) points engine
            // doesn't double-credit.
            const update: Record<string, any> = { status }
            if (note !== undefined) update.note = note

            let record
            try {
                record = await attendanceRepo.update({
                    filter: {
                        internId: new Types.ObjectId(internId),
                        date,
                    },
                    data: {
                        $set: update,
                        $setOnInsert: {
                            companyId: new Types.ObjectId(companyId),
                            internId: new Types.ObjectId(internId),
                            date,
                            pointsAwarded: false,
                        },
                    },
                    options: {
                        upsert: true,
                        returnDocument: "after",
                    },
                })
            } catch (err: any) {
                if (err && err.code === 11000) {
                    // Race: another request inserted the same day
                    // between our find and upsert. Retry once.
                    record = await attendanceRepo.update({
                        filter: {
                            internId: new Types.ObjectId(internId),
                            date,
                        },
                        data: { $set: update },
                        options: { returnDocument: "after" },
                    })
                } else {
                    throw err
                }
            }

            await cacheFlushPrefix(`attendance:list:${companyId}`)

            return successHandler({
                res,
                message: "Attendance marked",
                data: { attendance: record },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Bulk mark (admin override, multiple rows in one call) ----
    // Useful for the end-of-week "mark everyone missed today"
    // button, or pasting in a CSV of overrides. Each row is
    // upserted independently with the same shape as the single
    // `mark` endpoint. Best-effort: per-row business checks
    // (active enrollment, 7-day window) skip the row instead of
    // failing the whole batch. The response carries `marked[]`
    // and `skipped[]` so the UI can show a per-row result.
    bulkMark = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'attendance.mark')

            const { rows } = req.body as {
                rows: {
                    internId: string
                    date: string
                    status: AttendanceStatus
                    note?: string
                }[]
            }

            const tz = await getCompanyTz(companyId)
            const sevenAgo = ymdMinusDaysInTz(7, tz)

            // Pre-fetch all intern enrollment states in one round
            // trip so we don't issue N findOne calls. Active interns
            // at this company → can be marked; everyone else → skip.
            const internIds = [...new Set(rows.map((r) => r.internId))]
            const interns = await UserModel.find(
                { _id: { $in: internIds.map((id) => new Types.ObjectId(id)) } },
                { enrollments: 1 },
            ).lean()
            const internById = new Map(interns.map((u) => [u._id.toString(), u]))

            const companyOid = new Types.ObjectId(companyId)
            const marked: Array<{
                internId: string
                date: string
                status: AttendanceStatus
            }> = []
            const skipped: Array<{
                internId: string
                date: string
                reason: string
            }> = []

            // Per-row upsert. We iterate rather than insertMany
            // because each row can independently succeed or skip —
            // insertMany is all-or-nothing on validation errors.
            for (const row of rows) {
                const intern = internById.get(row.internId)
                if (!intern) {
                    skipped.push({
                        internId: row.internId,
                        date: row.date,
                        reason: "Intern not found",
                    })
                    continue
                }
                if (!hasActiveEnrollmentAt(intern, companyId)) {
                    skipped.push({
                        internId: row.internId,
                        date: row.date,
                        reason: "Not actively enrolled at this company",
                    })
                    continue
                }
                if (row.date < sevenAgo) {
                    skipped.push({
                        internId: row.internId,
                        date: row.date,
                        reason: "Date more than 7 days in the past",
                    })
                    continue
                }

                const update: Record<string, any> = { status: row.status }
                if (row.note !== undefined) update.note = row.note

                try {
                    await attendanceRepo.update({
                        filter: {
                            internId: new Types.ObjectId(row.internId),
                            date: row.date,
                        },
                        data: {
                            $set: update,
                            $setOnInsert: {
                                companyId: companyOid,
                                internId: new Types.ObjectId(row.internId),
                                date: row.date,
                                pointsAwarded: false,
                            },
                        },
                        options: {
                            upsert: true,
                            returnDocument: "after",
                        },
                    })
                    marked.push({
                        internId: row.internId,
                        date: row.date,
                        status: row.status,
                    })
                } catch (err: any) {
                    // Race with another writer; the row was upserted
                    // by someone else. Treat as success — the row
                    // exists at the end state we wanted.
                    if (err && err.code === 11000) {
                        await attendanceRepo.update({
                            filter: {
                                internId: new Types.ObjectId(row.internId),
                                date: row.date,
                            },
                            data: { $set: update },
                            options: { returnDocument: "after" },
                        })
                        marked.push({
                            internId: row.internId,
                            date: row.date,
                            status: row.status,
                        })
                    } else {
                        skipped.push({
                            internId: row.internId,
                            date: row.date,
                            reason:
                                err?.message ?? "Internal error during upsert",
                        })
                    }
                }
            }

            if (marked.length > 0) {
                await cacheFlushPrefix(`attendance:list:${companyId}`)
            }

            return successHandler({
                res,
                message: `Marked ${marked.length} row(s); skipped ${skipped.length}`,
                data: {
                    marked,
                    skipped,
                    totals: {
                        requested: rows.length,
                        marked: marked.length,
                        skipped: skipped.length,
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    // ============================================================
    // Attendance schedule (required-days table)
    // ============================================================

    // Upsert the schedule for (companyId, programId?). programId
    // absent → company default. Replacing an existing schedule
    // (PATCH-style) is the same call: just send the new shape.
    upsertSchedule = async (
        req: Request,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'attendance.mark')

            const body = req.body as {
                programId?: string
                weeklyPattern: IAttendanceSchedule["weeklyPattern"]
                effectiveFrom?: string
                effectiveTo?: string | null
            }

            if (body.programId) {
                await assertProgramInCompany(companyId, body.programId)
            }

            const filter: Record<string, any> = { companyId }
            if (body.programId) {
                filter.programId = new Types.ObjectId(body.programId)
            } else {
                filter.programId = null
            }

            const updateData: Record<string, any> = {
                weeklyPattern: body.weeklyPattern,
            }
            if (body.effectiveFrom !== undefined) {
                updateData.effectiveFrom = new Date(body.effectiveFrom)
            }
            if (body.effectiveTo !== undefined && body.effectiveTo !== null) {
                updateData.effectiveTo = new Date(body.effectiveTo)
            } else if (body.effectiveTo === null) {
                // Explicitly clear the upper bound.
                updateData.effectiveTo = null
            }

            const updated = await scheduleRepo.update({
                filter,
                data: updateData,
                options: { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
            })

            await Promise.all([
                cacheFlushPrefix(`attendance:schedule:${companyId}`),
                cacheDel(
                    `attendance:schedule:${companyId}:${
                        body.programId ?? "default"
                    }`,
                ),
            ])

            return successHandler({
                res,
                message: "Attendance schedule saved successfully",
                data: { schedule: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    // Fetch the schedule for (companyId, programId?). Returns
    // null when no schedule exists at that scope.
    getSchedule = async (
        req: Request,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertStaffPermission(companyId, user._id.toString(), 'attendance.mark')

            const programId = (req.query as { programId?: string }).programId
            if (programId) {
                await assertProgramInCompany(companyId, programId)
            }

            const cacheKey = `attendance:schedule:${companyId}:${
                programId ?? "default"
            }`
            const schedule = await cacheWrap(cacheKey, 60, async () => {
                const filter: Record<string, any> = { companyId }
                if (programId) {
                    filter.programId = new Types.ObjectId(programId)
                } else {
                    filter.programId = null
                }
                return scheduleRepo.findOne({ filter })
            })

            return successHandler({
                res,
                message: schedule
                    ? "Attendance schedule fetched successfully"
                    : "No schedule configured for this scope yet",
                data: { schedule: schedule ?? null },
            })
        } catch (error) {
            next(error)
        }
    }
}
