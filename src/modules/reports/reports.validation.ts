// Phase 16 / P3 #8 — Content reports validation.
//
// The wire contract is `{ targetType, targetId, reason }`. We
// accept the three target types BACKEND_GAPS_EN §8 names:
// `company | user | internship` (lowercase). The 24-char hex
// ObjectId regex is the same one used everywhere else —
// matches the global `objectId` pattern but inlined so this
// module has no cross-module dependency.
import { z } from "zod"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id')

export const createReportSchema = z.object({
    targetType: z.enum(['company', 'user', 'internship']),
    targetId: objectId,
    reason: z.string().trim().min(5).max(1000),
})

export type CreateReportInput = z.infer<typeof createReportSchema>
