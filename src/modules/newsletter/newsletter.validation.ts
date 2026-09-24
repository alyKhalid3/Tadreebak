// Phase 15 / P3 #7 — Newsletter subscribe validation.
//
// Public, no auth. Just an email address — same RFC 5322 check
// the contact form uses.
import { z } from "zod"

export const newsletterSubscribeSchema = z.object({
    email: z.string().trim().email(),
})

export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>
