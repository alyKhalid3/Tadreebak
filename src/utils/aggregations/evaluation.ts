// Phase 4 — evaluation / attendance aggregations.
//
// The dashboard needs three things from these utilities:
//   1. An intern's attendance rate over a period (for an evaluation
//      write — the admin never types the rate, we compute it).
//   2. A company's monthly attendance chart (last 6 months).
//   3. A company's KPIs (avg attendance, avg skill, engagement).
//
// All three are pure pipelines that the service composes with the
// company / intern filter — no business logic in the service layer
// beyond the composition.

import { AttendanceModel } from "../../DB/models/attendance.model"
import { EvaluationModel } from "../../DB/models/evaluation.model"
import { Types } from "mongoose"
import { AttendanceStatus } from "../../DB/types/attendance.type"

/**
 * Compute an intern's attendance rate over a period.
 *
 * The "rate" is the percentage of days in the period where the
 * intern's row has status === 'present' (i.e. they checked in on
 * time). 'late' is treated as present (they showed up). 'absent'
 * and 'excused' count as not-present.
 *
 * If the intern has zero rows in the period, the rate is 0 — the
 * admin sees a clear "no data" signal on the evaluation.
 */
export const computeAttendanceRate = async (
    internId: string,
    periodStart: Date,
    periodEnd: Date,
): Promise<number> => {
    // Pad the bounds to the full UTC days. The intern's check-in is
    // stored as a YYYY-MM-DD string, so $gte/$lte on the string
    // works as long as we format the bounds the same way.
    const startStr = periodStart.toISOString().slice(0, 10)
    const endStr = periodEnd.toISOString().slice(0, 10)

    const result = await AttendanceModel.aggregate<{
        present: number
        total: number
    }>([
        {
            $match: {
                internId: new Types.ObjectId(internId),
                date: { $gte: startStr, $lte: endStr },
            },
        },
        {
            $group: {
                _id: null,
                present: {
                    $sum: {
                        $cond: [
                            {
                                $in: [
                                    "$status",
                                    [AttendanceStatus.ATTENDED, AttendanceStatus.LATE],
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                total: { $sum: 1 },
            },
        },
    ])

    const row = result[0]
    if (!row || row.total === 0) return 0
    return Math.round((row.present / row.total) * 10000) / 100 // 2 decimals
}

/**
 * The dashboard's headline overallScore, derived from the three raw
 * inputs. 30% attendance, 30% skill, 20% teamwork, 20% engagement.
 *
 * `engagement` is the percent of tasks completed on time over the
 * period — but we don't have that wired up yet, so it's an
 * optional input defaulting to 0. The service passes the value
 * when it has one.
 */
export const computeOverallScore = (
    attendanceRate: number,
    skillRating: number,
    teamworkRating: number,
    engagementScore = 0,
): number => {
    // 0-5 ratings need to be scaled to 0-100. (rating / 5) * 100
    // does that, then we weight.
    const skillPct = (skillRating / 5) * 100
    const teamworkPct = (teamworkRating / 5) * 100
    const weighted =
        attendanceRate * 0.3 +
        skillPct * 0.3 +
        teamworkPct * 0.2 +
        engagementScore * 0.2
    return Math.round(Math.max(0, Math.min(100, weighted)) * 100) / 100
}

/**
 * Monthly attendance rate for the last `months` months (default 6).
 * Returns one entry per month, oldest first, with `presentDays`,
 * `totalDays`, and `rate` (0-100).
 */
export const monthlyAttendanceChart = async (
    companyId: string,
    months = 6,
): Promise<Array<{ month: string; presentDays: number; totalDays: number; rate: number }>> => {
    // Build the list of months ending at the current UTC month.
    const now = new Date()
    const result: Array<{ month: string; presentDays: number; totalDays: number; rate: number }> = []
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, "0")
        result.push({ month: `${y}-${m}`, presentDays: 0, totalDays: 0, rate: 0 })
    }
    const firstMonth = result[0]?.month
    if (!firstMonth) return result

    const agg = await AttendanceModel.aggregate<{
        _id: string
        present: number
        total: number
    }>([
        {
            $match: {
                companyId: new Types.ObjectId(companyId),
                // The date is "YYYY-MM-DD" — substring match on the
                // first 7 chars gives "YYYY-MM".
                date: { $regex: `^(${result.map((r) => r.month).join("|")})` },
            },
        },
        {
            $group: {
                _id: { $substr: ["$date", 0, 7] },
                present: {
                    $sum: {
                        $cond: [
                            {
                                $in: [
                                    "$status",
                                    [AttendanceStatus.ATTENDED, AttendanceStatus.LATE],
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                total: { $sum: 1 },
            },
        },
    ])

    const byMonth = new Map(agg.map((row) => [row._id, row]))
    for (const slot of result) {
        const row = byMonth.get(slot.month)
        if (row) {
            slot.presentDays = row.present
            slot.totalDays = row.total
            slot.rate =
                row.total === 0 ? 0 : Math.round((row.present / row.total) * 10000) / 100
        }
    }
    return result
}

/**
 * Company-wide KPIs for the dashboard cards.
 *
 *   - activeInterns: count of users with role=intern & enrollmentCompanyId
 *   - avgAttendance: weighted by intern count, over the last 30 days
 *   - avgSkillRating: mean of skillRating across the last 30 days
 *   - avgOverallScore: mean of overallScore across the last 30 days
 *   - evaluationsThisMonth: count of evaluations in the current month
 */
export const companyKpis = async (companyId: string) => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

    // Two round-trips: attendance for the chart + evaluations for the rest.
    const [attendanceAgg, evalAgg] = await Promise.all([
        AttendanceModel.aggregate<{ present: number; total: number }>([
            {
                $match: {
                    companyId: new Types.ObjectId(companyId),
                    date: {
                        $gte: thirtyDaysAgo.toISOString().slice(0, 10),
                        $lte: now.toISOString().slice(0, 10),
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    present: {
                        $sum: {
                            $cond: [
                                {
                                    $in: [
                                        "$status",
                                        [AttendanceStatus.ATTENDED, AttendanceStatus.LATE],
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    total: { $sum: 1 },
                },
            },
        ]),
        EvaluationModel.aggregate<{
            _id: null
            avgSkill: number | null
            avgOverall: number | null
            countThisMonth: number
        }>([
            { $match: { companyId: new Types.ObjectId(companyId) } },
            {
                $group: {
                    _id: null,
                    avgSkill: { $avg: "$skillRating" },
                    avgOverall: { $avg: "$overallScore" },
                    countThisMonth: {
                        $sum: {
                            $cond: [
                                { $gte: ["$evaluatedAt", monthStart] },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]),
    ])

    const att = attendanceAgg[0]
    const ev = evalAgg[0]
    return {
        avgAttendance: att && att.total > 0
            ? Math.round((att.present / att.total) * 10000) / 100
            : 0,
        avgSkillRating: ev?.avgSkill ? Math.round(ev.avgSkill * 100) / 100 : 0,
        avgOverallScore: ev?.avgOverall ? Math.round(ev.avgOverall * 100) / 100 : 0,
        evaluationsThisMonth: ev?.countThisMonth ?? 0,
    }
}

/**
 * The "alerts" view: interns with low attendance or overdue evals.
 * Used to surface the red dot on the dashboard.
 *
 *   - lowAttendance: average attendance rate over the last 30 days
 *     below 70%.
 *   - evaluationOverdue: no evaluation in the last 30 days.
 *
 * Returns at most 50 rows to keep the response small.
 */
export const companyAlerts = async (companyId: string) => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    // Get the company's active interns.
    // We need the User model — pull it in dynamically to avoid a
    // circular import at module load.
    const { UserModel } = await import("../../DB/models/user.model")
    const interns = await UserModel.find(
        {
            enrollmentCompanyId: new Types.ObjectId(companyId),
            role: "intern",
        },
        { _id: 1, firstName: 1, lastName: 1, email: 1, profilePicture: 1 },
    )
        .limit(50)
        .lean()

    if (interns.length === 0) return { lowAttendance: [], evaluationOverdue: [] }

    // For each intern, compute their 30-day attendance rate and
    // check for a recent evaluation. Two more aggregations, then we
    // zip the results in JS.
    const internIds = interns.map((i) => i._id)
    const [attAgg, evalAgg] = await Promise.all([
        AttendanceModel.aggregate<{ _id: Types.ObjectId; present: number; total: number }>([
            {
                $match: {
                    internId: { $in: internIds },
                    date: { $gte: cutoffStr },
                },
            },
            {
                $group: {
                    _id: "$internId",
                    present: {
                        $sum: {
                            $cond: [
                                {
                                    $in: [
                                        "$status",
                                        [AttendanceStatus.ATTENDED, AttendanceStatus.LATE],
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    total: { $sum: 1 },
                },
            },
        ]),
        EvaluationModel.aggregate<{ _id: Types.ObjectId; latest: Date }>([
            { $match: { internId: { $in: internIds } } },
            { $sort: { evaluatedAt: -1 } },
            {
                $group: {
                    _id: "$internId",
                    latest: { $max: "$evaluatedAt" },
                },
            },
        ]),
    ])

    const attByIntern = new Map(attAgg.map((r) => [r._id.toString(), r]))
    const evalByIntern = new Map(evalAgg.map((r) => [r._id.toString(), r.latest]))

    const lowAttendance: any[] = []
    const evaluationOverdue: any[] = []
    for (const intern of interns) {
        const id = (intern._id as Types.ObjectId).toString()
        const att = attByIntern.get(id)
        if (att && att.total >= 3) {
            const rate = (att.present / att.total) * 100
            if (rate < 70) {
                lowAttendance.push({
                    intern: pickInternSummary(intern),
                    attendanceRate: Math.round(rate * 100) / 100,
                    windowDays: 30,
                })
            }
        }
        const latestEval = evalByIntern.get(id)
        if (!latestEval || latestEval < cutoff) {
            evaluationOverdue.push({
                intern: pickInternSummary(intern),
                lastEvaluatedAt: latestEval ?? null,
            })
        }
    }
    return { lowAttendance, evaluationOverdue }
}

const pickInternSummary = (i: any) => ({
    _id: i._id,
    firstName: i.firstName,
    lastName: i.lastName,
    email: i.email,
    profilePicture: i.profilePicture,
})
