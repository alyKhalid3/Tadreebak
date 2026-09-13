// Evaluation = a formal review of an intern over a period. The
// company's dashboard aggregates these to show "who is doing well,
// who is falling behind". Phase 4 of the dashboard plan.
//
// Scores are 0-5 in half-steps (so a value is one of
// 0, 0.5, 1, 1.5, ..., 5). The derived `overallScore` is a
// weighted blend normalized to 0-100.
//
// `sharedWithIntern` gates the intern-side read — admins typically
// keep notes private until the review is final, then flip the
// boolean to release it (and notify the intern via the
// EVALUATION_SHARED notification).

import { Types } from "mongoose"

export interface IEvaluationPeriod {
    start: Date
    end: Date
}

export interface IEvaluation {
    _id?: Types.ObjectId
    internId: Types.ObjectId
    companyId: Types.ObjectId
    evaluatorId: Types.ObjectId
    period: IEvaluationPeriod
    // 0-100, computed from the intern's attendance rows over the
    // period. The service recomputes on create/update so the admin
    // never has to type it.
    attendanceRate: number
    // 0-5 in half-steps.
    skillRating: number
    teamworkRating: number
    // Derived overall (0-100). Weighted: 30% attendance, 30% skill,
    // 20% teamwork, 20% engagement. The dashboard reads this and
    // sorts interns by it.
    overallScore: number
    // Free-form notes. `privateNotes` is admin-only and never
    // returned to the intern.
    strengths?: string
    improvements?: string
    privateNotes?: string
    evaluatedAt: Date
    sharedWithIntern: boolean
    // Set when the admin flips `sharedWithIntern` to true. Used by
    // the intern-side /me/evaluations to display "shared on YYYY-MM-DD".
    sharedAt?: Date | null
    createdAt?: Date
    updatedAt?: Date
}

// Snapshot the intern sees when an evaluation is shared. Drops
// `privateNotes` and any other admin-only fields.
export type IEvaluationShared = Omit<IEvaluation, 'privateNotes'>
