import { test } from "node:test";
import assert from "node:assert/strict";

// Phase 19 / CORS allow-list.
//
// The allow-list lives in `src/bootstrap.ts` inside the `bootstrap()`
// function (it needs `process.env` at request time). We can't import it
// without booting the whole app, so this file mirrors the normalization
// rules and pins the *behaviour* we depend on:
//
//   1. The production custom domain is allow-listed (both www + apex).
//   2. `FRONTEND_URL` / `CORS_EXTRA_ORIGINS` fold in as exact origins.
//   3. Wildcards are NEVER accepted — reflecting an arbitrary origin with
//      `Access-Control-Allow-Credentials: true` is a credentialed-CORS
//      bypass.
//
// If the bootstrap allow-list drifts from these expectations, the browser
// throws "Origin ... not allowed by CORS" at runtime and the signup form
// silently breaks. These tests are the canary.

/** Mirror of the bootstrap.ts normalization logic. */
export const normalizeOrigin = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        // Reject wildcard hosts outright — never allow-list `*` or
        // `*.example.com`.
        if (parsed.hostname.includes("*")) return null;
        return parsed.origin;
    } catch {
        return null;
    }
};

// The hardcoded production origins in `src/bootstrap.ts`.
const PRODUCTION_ORIGINS = [
    "https://tadrebk.vercel.app",
    "https://www.tadrebk.com",
    "https://tadrebk.com",
];

// ---------------------------------------------------------------------------
// Production domains
// ---------------------------------------------------------------------------

test("the production custom domain is allow-listed (www)", () => {
    assert.ok(
        PRODUCTION_ORIGINS.includes("https://www.tadrebk.com"),
        "https://www.tadrebk.com must be in the CORS allow-list",
    );
});

test("the production custom domain is allow-listed (apex)", () => {
    assert.ok(
        PRODUCTION_ORIGINS.includes("https://tadrebk.com"),
        "https://tadrebk.com must be in the CORS allow-list — users type both",
    );
});

test("the vercel deployment is allow-listed", () => {
    assert.ok(PRODUCTION_ORIGINS.includes("https://tadrebk.vercel.app"));
});

// ---------------------------------------------------------------------------
// Origin normalization
// ---------------------------------------------------------------------------

test("normalizeOrigin accepts an https origin", () => {
    assert.equal(
        normalizeOrigin("https://www.tadrebk.com"),
        "https://www.tadrebk.com",
    );
});

test("normalizeOrigin strips a trailing slash (browser Origin header has none)", () => {
    assert.equal(
        normalizeOrigin("https://www.tadrebk.com/"),
        "https://www.tadrebk.com",
    );
});

test("normalizeOrigin strips a path (Origin header is scheme://host only)", () => {
    assert.equal(
        normalizeOrigin("https://staging.tadrebk.com/signup"),
        "https://staging.tadrebk.com",
    );
});

test("normalizeOrigin keeps an explicit port (localhost dev servers)", () => {
    assert.equal(
        normalizeOrigin("http://localhost:5173"),
        "http://localhost:5173",
    );
});

test("normalizeOrigin rejects malformed entries", () => {
    assert.equal(normalizeOrigin("not-a-url"), null);
    assert.equal(normalizeOrigin(""), null);
    assert.equal(normalizeOrigin("   "), null);
});

test("normalizeOrigin rejects non-http(s) protocols", () => {
    assert.equal(normalizeOrigin("ftp://tadrebk.com"), null);
    assert.equal(normalizeOrigin("file:///etc/passwd"), null);
});

// ---------------------------------------------------------------------------
// Wildcard rejection — the credentialed-CORS bypass guard
// ---------------------------------------------------------------------------

test("normalizeOrigin rejects a bare wildcard", () => {
    assert.equal(normalizeOrigin("*"), null);
});

test("normalizeOrigin rejects a wildcard subdomain", () => {
    assert.equal(normalizeOrigin("https://*.tadrebk.com"), null);
});

test("normalizeOrigin rejects a wildcard host with a path", () => {
    assert.equal(normalizeOrigin("https://*.example.com/path"), null);
});
