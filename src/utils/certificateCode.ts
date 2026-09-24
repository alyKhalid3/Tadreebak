// Certificate verification codes — HMAC-SHA256, base64url-encoded.
//
// Format: `<payloadB64>.<sigB64>` where:
//   payload = JSON.stringify({ appId: <24-char ObjectId> })
//   sig     = HMAC_SHA256(payloadB64, CERTIFICATE_SECRET)
//
// The code is the only anti-forgery token the public `/certificates/:code`
// endpoint accepts. We don't store the code on the application row — given
// a secret, `mintCertificateCode(appId)` is deterministic, so re-minting
// on each `markCompleted` (and re-verifying on each public read) gives the
// same string without persisting anything.
//
// Why HMAC and not JWT?
//   - The payload is one field (appId). JWT adds expiry/header overhead
//     we don't need.
//   - We never re-verify an issued cert "later" — verification always goes
//     against the live application row, which is the source of truth for
//     completion. JWT expiry would mislead readers that old codes time
//     out; in fact they stay valid as long as the underlying app row is
//     `completed: true`.
//   - crypto.createHmac is built-in, no extra dep.
//
// `verifyCertificateCodeSignature` is timing-safe (constant-time compare
// via `crypto.timingSafeEqual`) so a brute-force guesser can't extract
// the secret one byte at a time by hammering the endpoint.
import crypto from "node:crypto"

const PAYLOAD_SEPARATOR = "."

// base64url: no `+`/`/`, no `=` padding. URL-safe for both the URL path
// (Express `:code` param) and copy-paste. Node 16+ exposes Buffer's
// `base64url` encoding directly, so we lean on that.
const toB64Url = (buf: Buffer): string =>
    buf.toString("base64url")

const fromB64Url = (s: string): Buffer =>
    Buffer.from(s, "base64url")

/**
 * Mint a verification code for one completed application. The same
 * `(appId, secret)` pair always produces the same code — so caching
 * the result is unnecessary, and re-minting on every `markCompleted`
 * is cheap (~microseconds).
 *
 * The `secret` parameter is injected (rather than read from
 * `process.env` directly) so the function stays a pure helper —
 * callers read the env var once and pass it in, which keeps unit
 * tests hermetic.
 */
export const mintCertificateCode = (appId: string, secret: string): string => {
    if (!appId || typeof appId !== "string") {
        throw new TypeError("mintCertificateCode: appId is required")
    }
    if (!secret || typeof secret !== "string") {
        throw new TypeError("mintCertificateCode: secret is required")
    }
    const payload = JSON.stringify({ appId })
    const payloadB64 = toB64Url(Buffer.from(payload, "utf8"))
    const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest()
    return `${payloadB64}${PAYLOAD_SEPARATOR}${toB64Url(sig)}`
}

export type VerifyResult =
    | { ok: true; appId: string }
    | { ok: false; reason: "malformed" | "bad-signature" | "bad-payload" }

/**
 * Cryptographically verify a code's signature and decode its
 * payload. Pure — no DB, no env, no logging — so it's trivially
 * testable.
 *
 * Returns `{ ok: false, reason }` on every failure rather than
 * throwing; the public endpoint collapses all failure modes into
 * a single `{ valid: false }` response, so the controller never
 * needs to distinguish between "tampered" and "malformed".
 */
export const verifyCertificateCodeSignature = (code: string, secret: string): VerifyResult => {
    if (!code || typeof code !== "string" || !secret || typeof secret !== "string") {
        return { ok: false, reason: "malformed" }
    }
    const dotIdx = code.indexOf(PAYLOAD_SEPARATOR)
    if (dotIdx <= 0 || dotIdx !== code.lastIndexOf(PAYLOAD_SEPARATOR)) {
        // No separator, leading separator, or more than one separator.
        return { ok: false, reason: "malformed" }
    }
    const payloadB64 = code.slice(0, dotIdx)
    const sigB64 = code.slice(dotIdx + 1)
    if (!payloadB64 || !sigB64) {
        return { ok: false, reason: "malformed" }
    }

    const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest()
    let provided: Buffer
    let expectedBuf: Buffer
    try {
        provided = fromB64Url(sigB64)
        // Re-encode the expected digest to base64url to get a Buffer of
        // matching length; fromB64Url already gives us bytes.
        expectedBuf = expected
    } catch {
        return { ok: false, reason: "malformed" }
    }
    // Lengths must match before timingSafeEqual (it requires equal length).
    if (provided.length !== expectedBuf.length) {
        return { ok: false, reason: "bad-signature" }
    }
    if (!crypto.timingSafeEqual(provided, expectedBuf)) {
        return { ok: false, reason: "bad-signature" }
    }

    // Decode the payload AFTER the signature checks out so we don't
    // attempt JSON.parse on attacker-controlled input that may be
    // shaped to throw.
    let appId: unknown
    try {
        const payloadJson = fromB64Url(payloadB64).toString("utf8")
        const parsed = JSON.parse(payloadJson) as { appId?: unknown }
        appId = parsed?.appId
    } catch {
        return { ok: false, reason: "bad-payload" }
    }
    if (typeof appId !== "string" || appId.length === 0) {
        return { ok: false, reason: "bad-payload" }
    }
    return { ok: true, appId }
}

/**
 * Public projection of one verified certificate. Mirrors the
 * BACKEND_GAPS_EN §11 wire shape — only fields a third-party
 * verifier is meant to see.
 *
 * - `student` is privacy-preserving: first name + last initial only
 *   (same convention used by the aggregated-ratings reviews list).
 * - `internship` exposes the title so a verifier can confirm the
 *   role the student claims.
 * - `company` exposes the public name + logo URL.
 * - `completedAt` is the canonical completion timestamp.
 *
 * No email, no full last name, no application ObjectId, no
 * company-internal IDs.
 */
export type PublicCertificate = {
    valid: true
    student: { firstName: string; lastInitial: string }
    internship: { title: string }
    company: { name: string; logo?: string | null }
    completedAt: string
}

export const buildPublicCertificate = (params: {
    student: { firstName?: string; lastName?: string }
    internship: { title?: string }
    company: { name?: string; logo?: { secure_url?: string } | string | null }
    completedAt: Date
}): PublicCertificate => {
    const firstName = (params.student.firstName ?? "").trim()
    const lastName = (params.student.lastName ?? "").trim()
    const lastInitial = lastName.length > 0 ? `${(lastName[0] ?? "").toUpperCase()}.` : ""
    const completedAt = params.completedAt instanceof Date
        ? params.completedAt.toISOString()
        : new Date(params.completedAt).toISOString()
    let logo: string | null | undefined
    if (params.company.logo == null) {
        logo = null
    } else if (typeof params.company.logo === "string") {
        logo = params.company.logo
    } else {
        logo = params.company.logo.secure_url ?? null
    }
    return {
        valid: true,
        student: { firstName, lastInitial },
        internship: { title: params.internship.title ?? "" },
        company: { name: params.company.name ?? "", logo },
        completedAt,
    }
}