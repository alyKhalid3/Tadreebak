import { test } from "node:test";
import assert from "node:assert/strict";
import { contactFormSchema } from "./contact.validation";

test("contactFormSchema accepts a complete body", () => {
    const parsed = contactFormSchema.parse({
        name: "Aly Khalid",
        email: "aly@example.com",
        subject: "Question about internship posting",
        message: "Hi, I'd like to know more about the backend role.",
    })
    assert.equal(parsed.name, "Aly Khalid")
    assert.equal(parsed.subject, "Question about internship posting")
})

test("contactFormSchema accepts a body without subject (optional)", () => {
    const parsed = contactFormSchema.parse({
        name: "Aly",
        email: "aly@example.com",
        message: "Hi, just a quick question.",
    })
    assert.equal(parsed.subject, undefined)
})

test("contactFormSchema trims whitespace", () => {
    const parsed = contactFormSchema.parse({
        name: "  Aly  ",
        email: "  aly@example.com  ",
        message: "  hello there, friend  ",
    })
    assert.equal(parsed.name, "Aly")
    assert.equal(parsed.email, "aly@example.com")
    assert.equal(parsed.message, "hello there, friend")
})

test("contactFormSchema rejects a 1-char name", () => {
    assert.throws(() =>
        contactFormSchema.parse({
            name: "A",
            email: "aly@example.com",
            message: "hello there",
        }),
    )
})

test("contactFormSchema rejects a > 100-char name", () => {
    assert.throws(() =>
        contactFormSchema.parse({
            name: "a".repeat(101),
            email: "aly@example.com",
            message: "hello there",
        }),
    )
})

test("contactFormSchema rejects a bad email", () => {
    assert.throws(() =>
        contactFormSchema.parse({
            name: "Aly",
            email: "not-an-email",
            message: "hello there",
        }),
    )
})

test("contactFormSchema rejects a short message", () => {
    assert.throws(() =>
        contactFormSchema.parse({
            name: "Aly",
            email: "aly@example.com",
            message: "too short",
        }),
    )
})

test("contactFormSchema rejects a > 2000-char message", () => {
    assert.throws(() =>
        contactFormSchema.parse({
            name: "Aly",
            email: "aly@example.com",
            message: "x".repeat(2001),
        }),
    )
})
