// Phase 12 / P2 #5 — Save Companies validation.
//
// Pulled out into its own file so the param / query shapes can
// be unit-tested without spinning up Express.
import { z } from "zod"

export const companyIdParamSchema = z.object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid company id'),
})

export const listSavedCompaniesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
})
