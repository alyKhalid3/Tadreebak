import { z } from "zod";

const fileReferenceSchema = z.object({
    public_id: z.string().min(1),
    secure_url: z.string().url(),
    resourceType: z.enum(['image', 'raw']).optional(),
})

const courseSchema = z.object({
    name: z.string().trim().min(2).max(100),
    certificate: fileReferenceSchema.optional(),
})

export const updateProfileSchema = z.object({
    firstName: z.string().min(3).max(20).optional(),
    lastName: z.string().min(3).max(20).optional(),
    phone: z.string().optional(),
    bio: z.string().max(500).optional(),
    headline: z.string().max(100).optional(),
    skills: z.array(z.string()).optional(),
    categories: z.array(z.string().trim().min(1).max(50)).max(4).optional(),
    courses: z.array(courseSchema).max(20).optional(),
    dateOfBirth: z.string().datetime().optional(),
    gender: z.enum(['male', 'female']).optional(),
    address: z.string().optional(),
    education: z.array(z.object({
        institution: z.string(),
        degree: z.string(),
        field: z.string(),
        grade: z.string(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().optional()
    })).optional(),
    experience: z.never().optional(),
})
