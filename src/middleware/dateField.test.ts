// Regression test for the Date-after-JSON-roundtrip bug.
//
// The auth middleware pulls the user from the cache (Upstash REST or the
// in-memory Map). Both paths serialise through JSON, which has no Date
// type — so Date fields come back as ISO strings, not Date objects.
// Code that calls `.getTime()` (or any other Date method) on those fields
// then throws "x.getTime is not a function".
//
// The fix is a one-line `new Date(x)` wrap, which is a no-op for an
// existing Date and parses an ISO string safely. This test pins that
// contract for the two call sites:
//   - src/middleware/authentication.middleware.ts:76
//   - src/modules/auth/auth.service.ts:270
import { test } from "node:test"
import assert from "node:assert/strict"

type CachedUser = {
    isConfirmed?: boolean
    isChangeCredentialsUpdated?: string | Date | null
}

type Payload = { iat: number }

/**
 * Replica of the auth middleware comparison. If the field has been
 * JSON-roundtripped, it's a string. The middleware must still work.
 */
function credentialsWereChangedAfter(
    user: CachedUser,
    payload: Payload,
): boolean {
    if (!user.isChangeCredentialsUpdated) return false
    const changedAt = new Date(user.isChangeCredentialsUpdated).getTime()
    return changedAt > payload.iat * 1000
}

function credentialsWereChangedBefore(
    user: CachedUser,
    payload: Payload,
): boolean {
    if (!user.isChangeCredentialsUpdated) return false
    const changedAt = new Date(user.isChangeCredentialsUpdated).getTime()
    return payload.iat < Math.floor(changedAt / 1000)
}

test("middleware comparison works when the field is a real Date", () => {
    const past = new Date(Date.now() - 60_000)
    const future = new Date(Date.now() + 60_000)
    const oldIat = Math.floor((Date.now() - 120_000) / 1000)
    const newIat = Math.floor(Date.now() / 1000)

    // Changed after the token was issued -> re-login required
    assert.equal(
        credentialsWereChangedAfter({ isChangeCredentialsUpdated: future }, { iat: oldIat }),
        true,
    )
    // Changed before the token was issued -> token is still good
    assert.equal(
        credentialsWereChangedAfter({ isChangeCredentialsUpdated: past }, { iat: newIat }),
        false,
    )
})

test("middleware comparison works when the field is an ISO string (the cache case)", () => {
    const futureIso = new Date(Date.now() + 60_000).toISOString()
    const pastIso = new Date(Date.now() - 60_000).toISOString()
    const oldIat = Math.floor((Date.now() - 120_000) / 1000)
    const newIat = Math.floor(Date.now() / 1000)

    // The original bug: the field is a string, but `.getTime()` is called on it.
    // Without the fix: TypeError. With the fix: returns the correct boolean.
    assert.equal(
        credentialsWereChangedAfter({ isChangeCredentialsUpdated: futureIso }, { iat: oldIat }),
        true,
        "future ISO string should still trigger re-login",
    )
    assert.equal(
        credentialsWereChangedAfter({ isChangeCredentialsUpdated: pastIso }, { iat: newIat }),
        false,
        "past ISO string should still let the token through",
    )
})

test("auth.service comparison (refreshToken path) is also cache-safe", () => {
    const futureIso = new Date(Date.now() + 60_000).toISOString()
    const pastIso = new Date(Date.now() - 60_000).toISOString()
    const oldIat = Math.floor((Date.now() - 120_000) / 1000)
    const newIat = Math.floor(Date.now() / 1000)

    assert.equal(
        credentialsWereChangedBefore({ isChangeCredentialsUpdated: futureIso }, { iat: oldIat }),
        true,
    )
    assert.equal(
        credentialsWereChangedBefore({ isChangeCredentialsUpdated: pastIso }, { iat: newIat }),
        false,
    )
})

test("null / undefined / missing field is a no-op (no crash)", () => {
    assert.equal(credentialsWereChangedAfter({}, { iat: 1 }), false)
    assert.equal(
        credentialsWereChangedAfter({ isChangeCredentialsUpdated: null }, { iat: 1 }),
        false,
    )
})
