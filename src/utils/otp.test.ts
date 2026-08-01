import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyOtpAsync, MAX_OTP_ATTEMPTS } from "./otp";

test("verifyOtpAsync rejects missing OTP", async () => {
    const result = await verifyOtpAsync(undefined, "123456");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "expired");
});

test("verifyOtpAsync rejects expired OTP", async () => {
    const result = await verifyOtpAsync(
        { otp: "hashed", expiresAt: new Date(Date.now() - 1000), attempts: 0 },
        "123456",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "expired");
});

test("verifyOtpAsync rejects after MAX_OTP_ATTEMPTS", async () => {
    const result = await verifyOtpAsync(
        { otp: "hashed", expiresAt: new Date(Date.now() + 60_000), attempts: MAX_OTP_ATTEMPTS },
        "123456",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "exhausted");
});
