import { z } from "zod";
import { ApplicationStatus } from "../../DB/types/application.type";

const mcqAnswerSchema = z.object({
    type: z.literal('mcq'),
    selectedOption: z.string().min(1),
})

const writingAnswerSchema = z.object({
    type: z.literal('writing'),
    text: z.string().min(1),
})

export const answerSchema = z.discriminatedUnion('type', [mcqAnswerSchema, writingAnswerSchema])

export const createApplicationSchema = z.object({
    coverLetter: z.string().max(2000).optional(),
    answers: z.array(answerSchema).optional(),
})

export const updateApplicationStatusSchema = z.object({
    status: z.enum([ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED]),
})

export const listMyApplicationsQuerySchema = z.object({
    status: z.enum([ApplicationStatus.PENDING, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED]).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
})
