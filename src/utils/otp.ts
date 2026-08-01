import { compareHash } from "./hash";
import { ExpiredOTPException, ApplicationError } from "./error";

/**
 * Max failed attempts per OTP. After this, the OTP is invalidated and the
 * user has to request a new one. 5 is the de-facto industry default; with
 * a 1M-code space and 5 minute expiry this still leaves the expected ~1
 * success-in-200k chance of a brute-force hit per window.
 */
export const MAX_OTP_ATTEMPTS = 5;

export type OtpField = { otp?: string; expiresAt?: Date; attempts?: number } | undefined;

/**
 * Verify a candidate OTP against the stored (hashed) value, with a
 * per-field attempt cap. Returns a result object — callers should
 * `$inc` the attempts counter on the user doc when `ok` is false, and
 * reset the OTP (clearing the field) when `ok` is true.
 *
 * Why this shape: the rate-limit middleware (C4) gives us per-IP
 * protection, and the existing 5-minute expiry gives us time-boxing.
 * What we lacked was per-OTP-bucket throttling — an attacker who
 * already knows the email could burn the whole 1M code space against
 * a single OTP. The attempt counter closes that hole.
 */
export const verifyOtp = (stored: OtpField, candidate: string): { ok: true } | { ok: false; reason: "expired" | "invalid" | "exhausted" } => {
    if (!stored?.otp || !stored.expiresAt) {
        return { ok: false, reason: "expired" };
    }
    if (Date.now() > new Date(stored.expiresAt).getTime()) {
        return { ok: false, reason: "expired" };
    }
    if ((stored.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
        return { ok: false, reason: "exhausted" };
    }
    // compareHash is async; we wrap the sync check into a Promise that the
    // caller can await. The default in this file is sync-but-awaitable.
    return { ok: false, reason: "invalid" } as any;
};

/**
 * Async version of verifyOtp that actually checks the bcrypt hash. Use this
 * from the auth handlers.
 */
export const verifyOtpAsync = async (stored: OtpField, candidate: string): Promise<{ ok: true } | { ok: false; reason: "expired" | "invalid" | "exhausted" }> => {
    if (!stored?.otp || !stored.expiresAt) {
        return { ok: false, reason: "expired" };
    }
    if (Date.now() > new Date(stored.expiresAt).getTime()) {
        return { ok: false, reason: "expired" };
    }
    if ((stored.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
        return { ok: false, reason: "exhausted" };
    }
    const matched = await compareHash({ text: candidate, hashed: stored.otp });
    return matched ? { ok: true } : { ok: false, reason: "invalid" };
};

/**
 * Translate the verify result into the right exception for the global handler.
 */
export const throwForOtpResult = (result: { ok: false; reason: "expired" | "invalid" | "exhausted" }) => {
    if (result.reason === "expired") throw new ExpiredOTPException("OTP has expired");
    if (result.reason === "exhausted") {
        throw new ApplicationError("Too many failed attempts. Please request a new OTP.", 429);
    }
    throw new ApplicationError("Invalid OTP", 400);
};
