import { test } from "node:test"
import assert from "node:assert/strict"
import { certificateCodeSchema } from "./certificates.validation"
import { mintCertificateCode } from "../../utils/certificateCode"

const SECRET = "test-secret"
const APP_ID = "6ab1d2e3f4a5b6c7d8e9f0a1"

test("certificateCodeSchema: accepts a well-formed code", () => {
    const code = mintCertificateCode(APP_ID, SECRET)
    const parsed = certificateCodeSchema.parse({ code })
    assert.equal(parsed.code, code)
})

test("certificateCodeSchema: rejects a code with no separator", () => {
    assert.throws(() => certificateCodeSchema.parse({ code: "noseparator" }))
})

test("certificateCodeSchema: rejects a code with two separators", () => {
    assert.throws(() => certificateCodeSchema.parse({ code: "a.b.c" }))
})

test("certificateCodeSchema: rejects an empty payload", () => {
    assert.throws(() => certificateCodeSchema.parse({ code: ".sig" }))
})

test("certificateCodeSchema: rejects an empty signature", () => {
    assert.throws(() => certificateCodeSchema.parse({ code: "payload." }))
})

test("certificateCodeSchema: rejects a leading separator", () => {
    assert.throws(() => certificateCodeSchema.parse({ code: ".x" }))
})

test("certificateCodeSchema: rejects non-base64url chars in the payload", () => {
    // `+` is base64 (not base64url) and `!` is invalid everywhere.
    assert.throws(() => certificateCodeSchema.parse({ code: "p+y!.sigpart" }))
})

test("certificateCodeSchema: rejects an empty code", () => {
    assert.throws(() => certificateCodeSchema.parse({ code: "" }))
})

test("certificateCodeSchema: rejects a 600-char code (over the upper bound)", () => {
    const longPayload = "A".repeat(400)
    const longSig = "B".repeat(200)
    assert.throws(() => certificateCodeSchema.parse({ code: `${longPayload}.${longSig}` }))
})