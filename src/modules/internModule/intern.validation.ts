import { z } from "zod";
import { LocationEnum, WorkingTimeEnum } from "../../DB/types/internship.type";

export const createInternSchema = z.object({
    title: z.string().min(3).max(100),
    description: z.string().min(10),
    location: z.enum(LocationEnum),
    workingTime: z.enum(WorkingTimeEnum),
    softSkills: z.array(z.string()).min(1),
    technicalSkills: z.array(z.string()).min(1),
})

export const updateInternSchema = createInternSchema.partial()

export const listInternQuerySchema = z.object({
    type: z.enum(WorkingTimeEnum).optional(),
    location: z.enum(LocationEnum).optional(),
    companyId: z.string().optional(),
    title: z.string().optional(),
    closed: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
})
