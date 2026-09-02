import { z } from "zod"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id")

export const listInternsQuerySchema = z.object({
    programId: objectId.optional(),
    projectId: objectId.optional(),
    // Quick status filter. "active" = enrolled & no endDate, "alumni" = endDate set
    status: z.enum(["active", "alumni", "all"]).default("all"),
    search: z.string().trim().min(1).max(100).optional(),
    // Free-form sort. Phase 1 supports a couple of options; Phase 6's
    // dashboard aggregation endpoint handles the real "score" sort.
    sort: z.enum(["recent", "name", "points"]).default("recent"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const internIdParamSchema = z.object({
    internId: objectId,
})
