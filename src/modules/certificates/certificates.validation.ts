// Phase 17 / P5 #11 — Public certificate verification validation.
//
// The `:code` URL parameter is a base64url-encoded `<payload>.<sig>`
// pair. We accept a relaxed shape here (anything that's plausibly
// base64url + one dot) — the cryptographic check happens in the
// service. A 400 only fires when the param doesn't even look like
// a code, so attackers don't get a fast fingerprint-free rejection
// path that distinguishes "malformed" from "bad signature".
import { z } from "zod"

// base64url alphabet: A-Z a-z 0-9 - _  (no padding). We use a fixed
// length window (24+1+43 chars minimum, the latter being HMAC-SHA256
// in base64url = 43 chars) to catch obvious junk before hitting the
// service layer. We don't upper-bound the length — a future move to
// longer signatures or richer payloads shouldn't require touching
// this schema.
const B64URL = /^[A-Za-z0-9_-]+$/

export const certificateCodeSchema = z.object({
    code: z
        .string()
        .min(2)
        .max(512)
        .refine(
            (s) => {
                const dot = s.indexOf(".")
                if (dot <= 0 || dot !== s.lastIndexOf(".")) return false
                const [payload, sig] = s.split(".")
                if (!payload || !sig) return false
                return B64URL.test(payload) && B64URL.test(sig)
            },
            { message: "Invalid verification code format" },
        ),
})

export type CertificateCodeInput = z.infer<typeof certificateCodeSchema>