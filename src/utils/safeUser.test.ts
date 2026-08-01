import { test } from "node:test";
import assert from "node:assert/strict";
import { toSafeUser } from "./safeUser";

test("toSafeUser strips password, OTPs, and credential-change timestamp", () => {
    const user = {
        _id: "abc",
        firstName: "Aly",
        lastName: "Khalid",
        email: "aly@example.com",
        password: "$2b$10$hashed_password_should_never_leak",
        emailOtp: { otp: "123456", expiresAt: new Date() },
        passwordOtp: { otp: "654321", expiresAt: new Date() },
        newEmailOtp: { otp: "111111", expiresAt: new Date() },
        isChangeCredentialsUpdated: new Date(),
        newEmail: "new@example.com",
        __v: 0,
        role: "student",
    } as any;
    const safe = toSafeUser(user) as any;
    assert.equal(safe.password, undefined, "password should be stripped");
    assert.equal(safe.emailOtp, undefined, "emailOtp should be stripped");
    assert.equal(safe.passwordOtp, undefined, "passwordOtp should be stripped");
    assert.equal(safe.newEmailOtp, undefined, "newEmailOtp should be stripped");
    assert.equal(safe.isChangeCredentialsUpdated, undefined, "credential-change ts should be stripped");
    assert.equal(safe.newEmail, undefined, "newEmail should be stripped");
    assert.equal(safe.__v, undefined, "__v should be stripped");
    assert.equal(safe._id, "abc", "non-sensitive fields should pass through");
    assert.equal(safe.email, "aly@example.com");
});

test("toSafeUser works on a Mongoose-like document with toObject()", () => {
    const docLike = {
        toObject: () => ({
            _id: "x",
            password: "secret",
            email: "a@b.com",
        }),
    };
    const safe = toSafeUser(docLike as any) as any;
    assert.equal(safe.password, undefined);
    assert.equal(safe.email, "a@b.com");
});
