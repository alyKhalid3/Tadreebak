import { z } from "zod"
import { ProgramStatus } from "../../../DB/types/program.type"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id")

export const createProgramSchema = z.object({
    name: z.string().min(2).max(100).trim(),
    description: z.string().max(2000).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional().nullable(),
    maxInterns: z.coerce.number().int().min(1).max(1000).optional(),
    coverImage: z
        .object({
            public_id: z.string(),
            secure_url: z.string().url(),
        })
        .optional(),
})

export const updateProgramSchema = z.object({
    name: z.string().min(2).max(100).trim().optional(),
    description: z.string().max(2000).optional(),
    status: z.nativeEnum(ProgramStatus).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional().nullable(),
    maxInterns: z.coerce.number().int().min(1).max(1000).optional(),
    coverImage: z
        .object({
            public_id: z.string(),
            secure_url: z.string().url(),
        })
        .optional(),
})

export const listProgramsQuerySchema = z.object({
    status: z.nativeEnum(ProgramStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const programIdParamSchema = z.object({
    programId: objectId,
})

export const enrollInternsSchema = z.object({
    internIds: z.array(objectId).min(1).max(200),
})

export const unenrollInternSchema = z.object({
    programId: objectId,
    internId: objectId,
})
