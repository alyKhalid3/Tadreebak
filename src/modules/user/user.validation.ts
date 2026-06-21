import { z } from "zod";

export const updateProfileSchema = z.object({
    firstName: z.string().min(3).max(20).optional(),
    lastName: z.string().min(3).max(20).optional(),
    phone: z.string().optional(),
    bio: z.string().max(500).optional(),
    headline: z.string().max(100).optional(),
    skills: z.array(z.string()).optional(),
    dateOfBirth: z.string().datetime().optional(),
    gender: z.enum(['male', 'female']).optional(),
    address: z.string().optional(),
    education: z.array(z.object({
        institution: z.string(),
        degree: z.string(),
        field: z.string(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().optional()
    })).optional(),
    experience: z.array(z.object({
        company: z.string(),
        title: z.string(),
        description: z.string().optional(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().optional()
    })).optional()
})
