// Phase 14 / P3 #6 — Contact form validation.
//
// Public, no auth. Body is small (4 fields). Email format check
// is strict (RFC 5322 via Zod's `.email()`) so we don't accept
// obvious typos like `name@host` that would bounce at the SMTP
// step.
import { z } from "zod"

export const contactFormSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email(),
    subject: z.string().trim().min(2).max(200).optional(),
    message: z.string().trim().min(10).max(2000),
})

export type ContactFormInput = z.infer<typeof contactFormSchema>
