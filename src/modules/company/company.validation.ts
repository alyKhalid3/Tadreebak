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

export const updateCompany = z.object({
    name: z.string().min(3).max(50).optional(),
    description: z.string().optional(),
    industry: z.string().optional(),
    address: z.string().optional(),
    numberOfEmployees: z.string().optional(),
    companyEmail: z.email().optional(),
})

export const listCompanyQuerySchema = z.object({
    name: z.string().optional(),
    industry: z.string().optional(),
    address: z.string().optional(),
    companyEmail: z.string().optional(),
    approvedByAdmin: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
})