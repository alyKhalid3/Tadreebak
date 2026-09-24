// Tests for the certificate signing helpers. Pure, hermetic — no DB.
import { test } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import {
    mintCertificateCode,
    verifyCertificateCodeSignature,
    buildPublicCertificate,
} from "./certificateCode"

const SECRET = "test-certificate-secret-do-not-use-in-prod"
const APP_ID = "6ab1d2e3f4a5b6c7d8e9f0a1"

// ---- mintCertificateCode ----

test("mintCertificateCode: roundtrips through verifyCertificateCodeSignature", () => {
    const code = mintCertificateCode(APP_ID, SECRET)
    const result = verifyCertificateCodeSignature(code, SECRET)
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.appId, APP_ID)
})

test("mintCertificateCode: produces a deterministic code for the same (appId, secret)", () => {
    const a = mintCertificateCode(APP_ID, SECRET)
    const b = mintCertificateCode(APP_ID, SECRET)
    assert.equal(a, b)
})

test("mintCertificateCode: different secrets produce different codes", () => {
    const a = mintCertificateCode(APP_ID, SECRET)
    const b = mintCertificateCode(APP_ID, SECRET + "-other")
    assert.notEqual(a, b)
})

test("mintCertificateCode: throws when appId is empty", () => {
    assert.throws(() => mintCertificateCode("", SECRET), /appId is required/)
})

test("mintCertificateCode: throws when secret is empty", () => {
    assert.throws(() => mintCertificateCode(APP_ID, ""), /secret is required/)
})

test("mintCertificateCode: code has exactly one `.` separator", () => {
    const code = mintCertificateCode(APP_ID, SECRET)
    assert.equal(code.split(".").length, 2)
})

test("mintCertificateCode: code is URL-safe (no +, /, =)", () => {
    const code = mintCertificateCode(APP_ID, SECRET)
    assert.ok(!code.includes("+"), "code contains +")
    assert.ok(!code.includes("/"), "code contains /")
    assert.ok(!code.includes("="), "code contains =")
})

// ---- verifyCertificateCodeSignature ----

test("verifyCertificateCodeSignature: rejects code with no separator", () => {
    const result = verifyCertificateCodeSignature("noseparator", SECRET)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "malformed")
})

test("verifyCertificateCodeSignature: rejects code with two separators", () => {
    const result = verifyCertificateCodeSignature("a.b.c", SECRET)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "malformed")
})

test("verifyCertificateCodeSignature: rejects code with empty payload", () => {
    const result = verifyCertificateCodeSignature(".signature", SECRET)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "malformed")
})

test("verifyCertificateCodeSignature: rejects code with empty signature", () => {
    const result = verifyCertificateCodeSignature("payload.", SECRET)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "malformed")
})

test("verifyCertificateCodeSignature: rejects code with leading separator", () => {
    const result = verifyCertificateCodeSignature(".x", SECRET)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "malformed")
})

test("verifyCertificateCodeSignature: rejects empty code", () => {
    const result = verifyCertificateCodeSignature("", SECRET)
    assert.equal(result.ok, false)
})

test("verifyCertificateCodeSignature: rejects tampered signature", () => {
    const code = mintCertificateCode(APP_ID, SECRET)
    // Flip the last char of the signature — must fail.
    const lastChar = code.slice(-1)
    const flipped = lastChar === "A" ? "B" : "A"
    const tampered = code.slice(0, -1) + flipped
    const result = verifyCertificateCodeSignature(tampered, SECRET)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "bad-signature")
})

test("verifyCertificateCodeSignature: rejects code signed with a different secret", () => {
    const code = mintCertificateCode(APP_ID, SECRET + "-attacker")
    const result = verifyCertificateCodeSignature(code, SECRET)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "bad-signature")
})

test("verifyCertificateCodeSignature: rejects garbage in the signature slot", () => {
    const payloadB64 = mintCertificateCode(APP_ID, SECRET).split(".")[0]
    const result = verifyCertificateCodeSignature(`${payloadB64}.not-real-base64-url!!!`, SECRET)
    // base64url with `!` is invalid input; Buffer.from will likely
    // decode it as something, so we just check that verification
    // ultimately fails (either at decode or at signature compare).
    assert.equal(result.ok, false)
})

test("verifyCertificateCodeSignature: rejects payload with wrong shape", () => {
    // Manually craft a code whose payload is valid base64url but
    // doesn't decode to `{ appId: string }`. Sign it with the real
    // secret so the only failure is on the payload shape.
    const payloadB64 = Buffer.from(JSON.stringify({ appId: 123 }), "utf8").toString("base64url")
    const sig = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url")
    const code = `${payloadB64}.${sig}`
    const result = verifyCertificateCodeSignature(code, SECRET)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "bad-payload")
})

// ---- buildPublicCertificate ----

test("buildPublicCertificate: privacy — never exposes full last name", () => {
    const out = buildPublicCertificate({
        student: { firstName: "Sara", lastName: "Mostafa" },
        internship: { title: "Frontend Intern" },
        company: { name: "TechFlow" },
        completedAt: new Date("2026-08-12T10:00:00.000Z"),
    })
    assert.equal(out.valid, true)
    assert.equal(out.student.firstName, "Sara")
    assert.equal(out.student.lastInitial, "M.")
    // No full last name anywhere.
    assert.ok(!("lastName" in out.student))
})

test("buildPublicCertificate: empty last name → empty lastInitial, no crash", () => {
    const out = buildPublicCertificate({
        student: { firstName: "Ali", lastName: "" },
        internship: { title: "Backend Intern" },
        company: { name: "Acme" },
        completedAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    assert.equal(out.student.firstName, "Ali")
    assert.equal(out.student.lastInitial, "")
})

test("buildPublicCertificate: company.logo as object form (Cloudinary) → secure_url", () => {
    const out = buildPublicCertificate({
        student: { firstName: "Ali", lastName: "Z" },
        internship: { title: "x" },
        company: { name: "Acme", logo: { secure_url: "https://res.cloudinary.com/demo/image/upload/v1/acme.png" } },
        completedAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    assert.equal(out.company.logo, "https://res.cloudinary.com/demo/image/upload/v1/acme.png")
})

test("buildPublicCertificate: company.logo as string → passthrough", () => {
    const out = buildPublicCertificate({
        student: { firstName: "Ali", lastName: "Z" },
        internship: { title: "x" },
        company: { name: "Acme", logo: "https://cdn.example.com/logo.png" },
        completedAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    assert.equal(out.company.logo, "https://cdn.example.com/logo.png")
})

test("buildPublicCertificate: completedAt is always an ISO string", () => {
    const out = buildPublicCertificate({
        student: { firstName: "Ali", lastName: "Z" },
        internship: { title: "x" },
        company: { name: "Acme" },
        completedAt: new Date("2026-08-12T10:00:00.000Z"),
    })
    assert.equal(out.completedAt, "2026-08-12T10:00:00.000Z")
})