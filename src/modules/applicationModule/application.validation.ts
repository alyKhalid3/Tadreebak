import { z } from "zod";
import { ApplicationStatus } from "../../DB/types/application.type";

export const createApplicationSchema = z.object({
    coverLetter: z.string().max(2000).optional(),
})

export const updateApplicationStatusSchema = z.object({
    status: z.enum([ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED]),
})

export const listMyApplicationsQuerySchema = z.object({
    status: z.enum([ApplicationStatus.PENDING, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED]).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
})
