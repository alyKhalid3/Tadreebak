import { z } from "zod";
import { LocationEnum, WorkingTimeEnum } from "../../DB/types/internship.type";

const mcqQuestionSchema = z.object({
    type: z.literal('mcq'),
    prompt: z.string().min(1),
    options: z.array(z.string()).min(2),
})

const writingQuestionSchema = z.object({
    type: z.literal('writing'),
    prompt: z.string().min(1),
})

export const questionSchema = z.discriminatedUnion('type', [mcqQuestionSchema, writingQuestionSchema])

export const createInternSchema = z.object({
    title: z.string().min(3).max(100),
    description: z.string().min(10),
    location: z.enum(LocationEnum),
    workingTime: z.enum(WorkingTimeEnum),
    softSkills: z.array(z.string()).min(1),
    technicalSkills: z.array(z.string()).min(1),
    questions: z.array(questionSchema).optional(),
    preKnowledge: z.array(z.string()).optional(),
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
