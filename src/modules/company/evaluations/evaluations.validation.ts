// Phase 4 — Evaluation validation.
//
// The admin submits the period and the three raw scores; the service
// computes attendanceRate and overallScore. The intern-side list
// accepts a `period` query filter that pins either the year or
// YYYY-MM.
import { z } from "zod"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id")

// 0-5 in half-steps. We accept any number and let zod's number()
// reject non-numbers; the service rounds to the nearest 0.5 so the
// stored value is always in {0, 0.5, 1, ..., 5}.
const rating = z.coerce.number().min(0).max(5)

const period = z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
})

export const createEvaluationSchema = z
    .object({
        internId: objectId,
        period,
        skillRating: rating,
        teamworkRating: rating,
        strengths: z.string().trim().min(1).max(2000).optional(),
        improvements: z.string().trim().min(1).max(2000).optional(),
        privateNotes: z.string().trim().min(1).max(5000).optional(),
    })
    .refine((p) => p.period.end >= p.period.start, {
        message: "period.end must be on or after period.start",
        path: ["period", "end"],
    })

export const updateEvaluationSchema = z
    .object({
        skillRating: rating.optional(),
        teamworkRating: rating.optional(),
        strengths: z.string().trim().min(1).max(2000).optional(),
        improvements: z.string().trim().min(1).max(2000).optional(),
        privateNotes: z.string().trim().min(1).max(5000).optional(),
    })
    .refine(
        (u) =>
            // At least one field must be present — reject empty patches.
            Object.keys(u).length > 0,
        { message: "At least one field is required" },
    )

export const listEvaluationsQuerySchema = z.object({
    internId: objectId.optional(),
    // YYYY-MM or YYYY (loose; we filter with $regex)
    period: z.string().trim().min(4).max(7).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const evaluationIdParamSchema = z.object({
    evaluationId: objectId,
})

export const internIdParamSchema = z.object({
    internId: objectId,
})

// Intern-side: list my own evaluations (only sharedWithIntern).
export const myEvaluationsQuerySchema = z.object({
    period: z.string().trim().min(4).max(7).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})
