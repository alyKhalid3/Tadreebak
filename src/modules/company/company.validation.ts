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
    // Phase 10 / P2 #D — public profile enrichment fields.
    // Optional on create so existing flows don't break; the
    // front-end will populate them in the "Edit profile"
    // screen later.
    website: z.string().url().optional(),
    linkedin: z.string().url().optional(),
    headline: z.string().max(200).optional(),
    foundedYear: z.coerce.number().int().min(1800).max(2100).optional(),
    // Phase 19 / Profile-completion flag. Defaults to `true`
    // because the on-boarding form is the "Submit for review"
    // button — when the user clicks it, they're simultaneously
    // creating the company AND declaring it ready for admin
    // review. The admin queue filter (`isCompleted=true AND
    // approvedByAdmin=false`) picks it up automatically; the
    // admin can then flip `approvedByAdmin=true`.
    //
    // Optional in the body so a future "create as draft" flow
    // (rare) can pass `isCompleted: false` explicitly. Anything
    // else (e.g. `null`, missing) falls back to the default.
    isCompleted: z.boolean().optional().default(true),
})

export const updateCompany = z.object({
    name: z.string().min(3).max(50).optional(),
    description: z.string().optional(),
    industry: z.string().optional(),
    address: z.string().optional(),
    location: companyLocationSchema.optional(),
    numberOfEmployees: z.string().optional(),
    companyEmail: z.email().optional(),
    // Phase 10 / P2 #D — public profile enrichment fields.
    website: z.string().url().optional(),
    linkedin: z.string().url().optional(),
    headline: z.string().max(200).optional(),
    foundedYear: z.coerce.number().int().min(1800).max(2100).optional(),
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

// Phase 19 / Company profile-completion toggle.
//
// The company owner uses this to signal "I've finished editing the
// profile, please review it" (sets `isCompleted=true`). The admin
// queue filters on this flag, and the admin `approve` endpoint
// refuses with 400 unless `isCompleted=true`.
//
// Body accepts an explicit `isCompleted: boolean` so the endpoint
// can also be used to undo a mistaken click (set to false). The
// service refuses to flip `isCompleted=false` once
// `approvedByAdmin=true` — that's a frozen state from that point on.
export const completeProfileSchema = z.object({
    isCompleted: z.boolean({
        message: "isCompleted must be a boolean (true to submit for review, false to un-submit)",
    }),
})