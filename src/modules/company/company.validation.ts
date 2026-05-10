import { z } from 'zod'

export const createCompany = z.object({
    name: z.string().min(3).max(50),
    description: z.string(),
    industry: z.string(),
    address: z.string(),
    numberOfEmployees: z.string(),
    companyEmail: z.email(),
    legalAttachment: z.object({
        fieldname: z.string(),
        originalname: z.string(),
        mimetype: z.string(),
        size: z.number()
    }),
})