import { z } from "zod"
import { ProjectStatus } from "../../../DB/types/project.type"

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id")

export const createProjectSchema = z.object({
    name: z.string().min(2).max(100).trim(),
    description: z.string().max(2000).optional(),
    programId: objectId.optional(),
    internIds: z.array(objectId).max(200).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional().nullable(),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #10b981")
        .optional(),
})

export const updateProjectSchema = z.object({
    name: z.string().min(2).max(100).trim().optional(),
    description: z.string().max(2000).optional(),
    programId: objectId.optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional().nullable(),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
})

export const listProjectsQuerySchema = z.object({
    status: z.nativeEnum(ProjectStatus).optional(),
    programId: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const projectIdParamSchema = z.object({
    projectId: objectId,
})

export const assignInternsSchema = z.object({
    internIds: z.array(objectId).min(1).max(200),
})
