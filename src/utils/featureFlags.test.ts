// Unit tests for the feature flag helper. The flag is memoised, so each
// test mutates `process.env` AND calls the reset hook before re-reading.
import { test } from "node:test"
import assert from "node:assert/strict"
import { isBillingEnabled, __resetFeatureFlagsForTests } from "./featureFlags"

function setBillingEnv(value: string | undefined) {
    if (value === undefined) delete process.env.BILLING_ENABLED
    else process.env.BILLING_ENABLED = value
    __resetFeatureFlagsForTests()
}

test("isBillingEnabled defaults to true when env var is missing", () => {
    setBillingEnv(undefined)
    assert.equal(isBillingEnabled(), true)
})

test("isBillingEnabled defaults to true when env var is empty", () => {
    setBillingEnv("")
    assert.equal(isBillingEnabled(), true)
})

test("isBillingEnabled returns true for explicit 'true'", () => {
    setBillingEnv("true")
    assert.equal(isBillingEnabled(), true)
})

test("isBillingEnabled returns false for 'false'", () => {
    setBillingEnv("false")
    assert.equal(isBillingEnabled(), false)
})

test("isBillingEnabled is case-insensitive ('FALSE', 'False')", () => {
    setBillingEnv("FALSE")
    assert.equal(isBillingEnabled(), false)
    setBillingEnv("False")
    assert.equal(isBillingEnabled(), false)
})

test("isBillingEnabled treats '0' as disabled", () => {
    setBillingEnv("0")
    assert.equal(isBillingEnabled(), false)
})

test("isBillingEnabled is memoised (subsequent env changes don't flip it without a reset)", () => {
    setBillingEnv("true")
    assert.equal(isBillingEnabled(), true)
    // Mutate env after the import — without the reset hook, the memoised
    // value holds. The middleware / service code is expected to read the
    // flag at boot, not per-request — a flag change requires a restart.
    process.env.BILLING_ENABLED = "false"
    assert.equal(
        isBillingEnabled(),
        true,
        "must not flip without a process restart",
    )
    // And the reset hook lets tests / runtime override the memoised value.
    __resetFeatureFlagsForTests()
    assert.equal(isBillingEnabled(), false)
})

test("isBillingEnabled whitespace-pads are tolerated", () => {
    setBillingEnv("  false  ")
    assert.equal(isBillingEnabled(), false)
    setBillingEnv("  ")
    assert.equal(isBillingEnabled(), true, "whitespace-only is treated as 'true'")
})
