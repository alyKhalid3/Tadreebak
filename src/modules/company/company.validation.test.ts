import { test } from "node:test";
import assert from "node:assert/strict";
import { createCompany, updateCompany } from "./company.validation";

// Phase 10 / P2 #D — focused tests for the four new enrichment
// fields. The legacy field tests (name / description / email /
// location) are covered by the controller's Swagger + manual
// smoke tests today; these target the new wire shape exactly.

const minimalUpdate = {
    name: 'TechFlow',
    description: 'We build stuff.',
    industry: 'Software',
    address: 'Cairo, EG',
    numberOfEmployees: '50',
    companyEmail: 'hi@techflow.io',
}

// ---------------------------------------------------------------------------
// updateCompany — website / linkedin / headline / foundedYear
// ---------------------------------------------------------------------------

test("updateCompany accepts the four new enrichment fields", () => {
    const parsed = updateCompany.parse({
        website: 'https://techflow.io',
        linkedin: 'https://linkedin.com/company/techflow',
        headline: 'Building payment infra for MENA',
        foundedYear: 2018,
    })
    assert.equal(parsed.website, 'https://techflow.io')
    assert.equal(parsed.linkedin, 'https://linkedin.com/company/techflow')
    assert.equal(parsed.headline, 'Building payment infra for MENA')
    assert.equal(parsed.foundedYear, 2018)
})

test("updateCompany accepts each enrichment field on its own (no co-requirement)", () => {
    const a = updateCompany.parse({ website: 'https://techflow.io' })
    assert.equal(a.website, 'https://techflow.io')
    const b = updateCompany.parse({ headline: 'short' })
    assert.equal(b.headline, 'short')
    const c = updateCompany.parse({ foundedYear: 2005 })
    assert.equal(c.foundedYear, 2005)
})

test("updateCompany rejects a non-URL website", () => {
    assert.throws(() => updateCompany.parse({ website: 'not-a-url' }))
})

test("updateCompany rejects a website without a scheme", () => {
    // We accept any well-formed URL, but require a scheme so the
    // link becomes clickable without the front-end guessing.
    assert.throws(() => updateCompany.parse({ website: 'techflow.io' }))
})

test("updateCompany rejects a non-URL linkedin", () => {
    assert.throws(() =>
        updateCompany.parse({ linkedin: 'linkedin.com/company/techflow' }),
    )
})

test("updateCompany rejects headline > 200 chars", () => {
    assert.throws(() =>
        updateCompany.parse({ headline: 'x'.repeat(201) }),
    )
})

test("updateCompany accepts headline exactly 200 chars", () => {
    const parsed = updateCompany.parse({ headline: 'x'.repeat(200) })
    assert.equal(parsed.headline?.length, 200)
})

test("updateCompany coerces foundedYear string", () => {
    // The frontend sometimes serializes numbers as strings via
    // form fields. Coercion keeps the wire permissive without
    // dropping the type guarantee at the service layer.
    const parsed = updateCompany.parse({ foundedYear: '2020' })
    assert.equal(parsed.foundedYear, 2020)
    assert.equal(typeof parsed.foundedYear, 'number')
})

test("updateCompany rejects foundedYear < 1800", () => {
    assert.throws(() => updateCompany.parse({ foundedYear: 1500 }))
})

test("updateCompany rejects foundedYear > 2100", () => {
    assert.throws(() => updateCompany.parse({ foundedYear: 2500 }))
})

test("updateCompany rejects a non-integer foundedYear", () => {
    // We want 4-digit years, not 2020.5.
    assert.throws(() => updateCompany.parse({ foundedYear: 2020.5 }))
})

// ---------------------------------------------------------------------------
// createCompany — same shape additions
// ---------------------------------------------------------------------------

test("createCompany accepts the four new enrichment fields alongside the legacy ones", () => {
    const parsed = createCompany.parse({
        ...minimalUpdate,
        legalAttachment: {
            fieldname: 'tax.pdf',
            originalname: 'tax.pdf',
            mimetype: 'application/pdf',
            size: 1024,
        },
        website: 'https://techflow.io',
        linkedin: 'https://linkedin.com/company/techflow',
        headline: 'Building payment infra for MENA',
        foundedYear: 2018,
    })
    assert.equal(parsed.website, 'https://techflow.io')
    assert.equal(parsed.foundedYear, 2018)
})

test("createCompany still works without the enrichment fields (legacy path unbroken)", () => {
    // Inputs that worked before Phase 10 should still work today.
    const parsed = createCompany.parse({
        ...minimalUpdate,
        legalAttachment: {
            fieldname: 'tax.pdf',
            originalname: 'tax.pdf',
            mimetype: 'application/pdf',
            size: 1024,
        },
    })
    assert.equal(parsed.headline, undefined)
    assert.equal(parsed.foundedYear, undefined)
})

test("createCompany rejects invalid website", () => {
    assert.throws(() =>
        createCompany.parse({
            ...minimalUpdate,
            legalAttachment: {
                fieldname: 'tax.pdf',
                originalname: 'tax.pdf',
                mimetype: 'application/pdf',
                size: 1024,
            },
            website: 'not-a-url',
        }),
    )
})

test("createCompany rejects invalid foundedYear", () => {
    assert.throws(() =>
        createCompany.parse({
            ...minimalUpdate,
            legalAttachment: {
                fieldname: 'tax.pdf',
                originalname: 'tax.pdf',
                mimetype: 'application/pdf',
                size: 1024,
            },
            foundedYear: 9999,
        }),
    )
})
