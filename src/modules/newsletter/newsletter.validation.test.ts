import { test } from "node:test";
import assert from "node:assert/strict";
import { newsletterSubscribeSchema } from "./newsletter.validation";

test("newsletterSubscribeSchema accepts a valid email", () => {
    const parsed = newsletterSubscribeSchema.parse({ email: "aly@example.com" })
    assert.equal(parsed.email, "aly@example.com")
})

test("newsletterSubscribeSchema trims whitespace", () => {
    const parsed = newsletterSubscribeSchema.parse({ email: "  aly@example.com  " })
    assert.equal(parsed.email, "aly@example.com")
})

test("newsletterSubscribeSchema rejects a bad email", () => {
    assert.throws(() => newsletterSubscribeSchema.parse({ email: "not-an-email" }))
})

test("newsletterSubscribeSchema rejects a missing email", () => {
    assert.throws(() => newsletterSubscribeSchema.parse({}))
})

test("newsletterSubscribeSchema rejects an empty email", () => {
    assert.throws(() => newsletterSubscribeSchema.parse({ email: "" }))
})
