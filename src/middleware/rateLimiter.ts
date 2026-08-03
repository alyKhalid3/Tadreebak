
import rateLimit, { type Options } from "express-rate-limit";

/**
 * Build a no-op middleware that always calls next(). We use this to
 * "disable" the rate limiter in dev/test without removing the wiring
 * — the code stays deployed, just inert. Flip RATE_LIMIT_ENABLED=true
 * (env var on the host) to turn both limiters on for production.
 */
const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();

const buildLimiter = (overrides: Partial<Options>) => {
    if (process.env.RATE_LIMIT_ENABLED !== "true") {
        return passthrough as unknown as ReturnType<typeof rateLimit>;
    }
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        // 300/15min ≈ 20 req/min sustained. Enough headroom for normal
        // browsing (a user opening 5 tabs and scrolling through listings
        // for 5 minutes) but tight enough to stop OTP brute force
        // and signup spam.
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        ...overrides,
    });
};

/**
 * Global limiter — applied to every non-whitelisted API route.
 * Off in dev by default; set RATE_LIMIT_ENABLED=true in prod.
 */
export const globalLimiter = buildLimiter({
    message: { errMsg: "Too many requests, please try again later", cause: 429 },
});

/**
 * Per-route limiter for /auth/*. Off in dev by default.
 * 10/15min is tight enough that a 6-digit OTP (1M code space) cannot
 * be brute-forced inside the 5-minute OTP window, even before the
 * per-account attempt cap kicks in.
 */
export const authLimiter = buildLimiter({
    max: 10,
    message: { errMsg: "Too many auth attempts, please try again later", cause: 429 },
});
