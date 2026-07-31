import { z } from 'zod'

// Create goes through multer (multipart), so `location` arrives as a JSON
// string (e.g. '{"lat":30.04,"lng":31.23}'); update is JSON and sends an object.
const companyLocationSchema = z.preprocess(
    (value) => {
        if (typeof value === 'string' && value.trim()) {
            try {
                return JSON.parse(value)
            } catch {
                return value
            }
        }
        return value
    },
    z.object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
    }),
)

export const createCompany = z.object({
    name: z.string().min(3).max(50),
    description: z.string(),
    industry: z.string(),
    address: z.string(),
    location: companyLocationSchema.optional(),
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
    location: companyLocationSchema.optional(),
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

export const listPendingCompaniesQuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
})