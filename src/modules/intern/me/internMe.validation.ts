// Phase 3 — intern self-service validation (Phase 5: per-company).
//
// All inputs are simple: an optional date range for the attendance
// history endpoint, and a note for the check-in. ObjectIds in the
// path are handled by the express router.

import { z } from "zod"

// YYYY-MM-DD, the same shape we store on the Attendance doc.
const dateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")

// 24-char ObjectId for the :companyId path param (used by all the
// per-company endpoints in this module).
const companyIdParamSchema = z.object({
    companyId: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid company id"),
})

export const attendanceHistoryQuerySchema = z
    .object({
        from: dateString.optional(),
        to: dateString.optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .refine(
        (q) =>
            // If both bounds are present, `to` must be on or after `from`.
            // Otherwise we'd silently return an empty list and the user
            // would assume there's no attendance for that range.
            !q.from || !q.to || q.to >= q.from,
        { message: "to must be on or after from", path: ["to"] },
    )

export { companyIdParamSchema }
