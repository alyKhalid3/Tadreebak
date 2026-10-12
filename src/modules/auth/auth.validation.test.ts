import { test } from "node:test";
import assert from "node:assert/strict";
import { signupSchema } from "./auth.validation";

// Phase 19 / `pendingRole` on signup — the "I came here as a
// student / I came here as a company" pick. Stored on
// `User.pendingRole` as a pure intent signal; `User.role` stays
// `STUDENT` at signup and only flips to `COMPANY_OWNER` when
// the user actually creates a company.

const baseSignup = {
    firstName: "Layla",
    lastName: "Hassan",
    email: "layla@example.com",
    password: "StrongP4ss!",
    confirmPassword: "StrongP4ss!",
    phone: "+201234567890",
};

test("signupSchema accepts pendingRole: 'company' (the HR / company flow)", () => {
    const parsed = signupSchema.parse({ ...baseSignup, pendingRole: "company" });
    assert.equal(parsed.pendingRole, "company");
});

test("signupSchema accepts pendingRole: 'student' (the applicant flow)", () => {
    const parsed = signupSchema.parse({ ...baseSignup, pendingRole: "student" });
    assert.equal(parsed.pendingRole, "student");
});

test("signupSchema defaults pendingRole to 'student' when the field is missing (back-compat)", () => {
    // Legacy signups that don't send the field at all still work
    // and land on the student onboarding flow.
    const parsed = signupSchema.parse({ ...baseSignup });
    assert.equal(parsed.pendingRole, "student");
});

test("signupSchema defaults pendingRole to 'student' when the field is undefined", () => {
    const parsed = signupSchema.parse({ ...baseSignup, pendingRole: undefined });
    assert.equal(parsed.pendingRole, "student");
});

test("signupSchema rejects null pendingRole (must be a real value or omitted)", () => {
    // null is not a valid "skip" sentinel — callers must either
    // send a real value or omit the field entirely. A frontend
    // bug that sends null would otherwise silently fall through
    // to "student" and hide the bug.
    assert.throws(() =>
        signupSchema.parse({ ...baseSignup, pendingRole: null }),
    );
});

test("signupSchema rejects unknown pendingRole values", () => {
    assert.throws(() =>
        signupSchema.parse({ ...baseSignup, pendingRole: "admin" }),
    );
    assert.throws(() =>
        signupSchema.parse({ ...baseSignup, pendingRole: "intern" }),
    );
    assert.throws(() =>
        signupSchema.parse({ ...baseSignup, pendingRole: "owner" }),
    );
});

test("signupSchema rejects non-string pendingRole", () => {
    assert.throws(() =>
        signupSchema.parse({ ...baseSignup, pendingRole: 1 }),
    );
    assert.throws(() =>
        signupSchema.parse({ ...baseSignup, pendingRole: { value: "company" } }),
    );
});

test("signupSchema still works with the other Phase 19 field (education) + pendingRole together", () => {
    // Sanity: adding pendingRole didn't break the existing
    // optional education array.
    const parsed = signupSchema.parse({
        ...baseSignup,
        pendingRole: "company",
        education: [
            {
                institution: "Cairo University",
                degree: "BSc",
                field: "CS",
                grade: "3.8",
                startDate: "2020-09-01",
                endDate: "2024-06-30",
            },
        ],
    });
    assert.equal(parsed.pendingRole, "company");
    assert.equal(parsed.education?.length, 1);
});
