import { test } from "node:test";
import assert from "node:assert/strict";
import {
    updateProfileSchema,
    addCourseBodySchema,
    updateCourseBodySchema,
    skillSchema,
} from "./user.validation";

// ---------------------------------------------------------------------------
// updateProfileSchema
// ---------------------------------------------------------------------------

test("updateProfileSchema accepts a plain string skills[] (backward-compat)", () => {
    const parsed = updateProfileSchema.parse({
        skills: ["React", "Excel", "TypeScript"],
    })
    assert.deepEqual(parsed.skills, ["React", "Excel", "TypeScript"])
})

test("updateProfileSchema accepts a mixed skills[] of strings and objects", () => {
    const parsed = updateProfileSchema.parse({
        skills: [
            "React",
            {
                name: "Node.js",
                source: "internship",
                sourceRef: "Backend @ TechFlow",
                description: "Built 3 services",
            },
        ],
    })
    assert.equal(parsed.skills?.length, 2)
    assert.equal(typeof parsed.skills?.[0], "string")
    assert.equal((parsed.skills?.[1] as any).name, "Node.js")
    assert.equal((parsed.skills?.[1] as any).source, "internship")
})

test("updateProfileSchema rejects a skill object with a bad source enum", () => {
    assert.throws(() =>
        updateProfileSchema.parse({
            skills: [{ name: "X", source: "wrong", sourceRef: "Y" }],
        })
    )
})

test("updateProfileSchema accepts socials[] with platform + url", () => {
    const parsed = updateProfileSchema.parse({
        socials: [
            { platform: "LinkedIn", url: "https://linkedin.com/in/aly" },
            { platform: "GitHub", url: "https://github.com/aly" },
        ],
    })
    assert.equal(parsed.socials?.length, 2)
    assert.equal(parsed.socials?.[0]?.platform, "LinkedIn")
})

test("updateProfileSchema rejects socials without a url", () => {
    assert.throws(() =>
        updateProfileSchema.parse({
            socials: [{ platform: "LinkedIn" }],
        })
    )
})

test("updateProfileSchema rejects socials with a non-URL url", () => {
    assert.throws(() =>
        updateProfileSchema.parse({
            socials: [{ platform: "LinkedIn", url: "not-a-url" }],
        })
    )
})

test("updateProfileSchema accepts education[] with optional description", () => {
    const parsed = updateProfileSchema.parse({
        education: [
            {
                institution: "Cairo University",
                degree: "BSc",
                field: "Computer Science",
                grade: "3.7",
                startDate: "2020-09-01T00:00:00Z",
                endDate: "2024-06-01T00:00:00Z",
                description: "Thesis on distributed caching.",
            },
        ],
    })
    assert.equal(parsed.education?.[0]?.description, "Thesis on distributed caching.")
})

test("updateProfileSchema accepts education[] without description", () => {
    const parsed = updateProfileSchema.parse({
        education: [
            {
                institution: "Cairo University",
                degree: "BSc",
                field: "Computer Science",
                grade: "3.7",
                startDate: "2020-09-01",
            },
        ],
    })
    assert.equal(parsed.education?.[0]?.description, undefined)
})

test("updateProfileSchema accepts courses[] with date window and description", () => {
    const parsed = updateProfileSchema.parse({
        courses: [
            {
                name: "Advanced Node.js",
                startDate: "2025-09-01T00:00:00Z",
                endDate: "2025-12-01T00:00:00Z",
                present: false,
                description: "Backend patterns course",
            },
        ],
    })
    assert.equal(parsed.courses?.[0]?.present, false)
    assert.equal(parsed.courses?.[0]?.description, "Backend patterns course")
    assert.ok(parsed.courses?.[0]?.startDate instanceof Date)
})

test("updateProfileSchema rejects courses[] with name < 2 chars", () => {
    assert.throws(() =>
        updateProfileSchema.parse({
            courses: [{ name: "A" }],
        })
    )
})

test("updateProfileSchema rejects > 50 skills", () => {
    assert.throws(() =>
        updateProfileSchema.parse({
            skills: Array.from({ length: 51 }, (_, i) => `s${i}`),
        })
    )
})

test("updateProfileSchema rejects > 10 socials", () => {
    assert.throws(() =>
        updateProfileSchema.parse({
            socials: Array.from({ length: 11 }, (_, i) => ({
                platform: `p${i}`,
                url: "https://example.com",
            })),
        })
    )
})

// ---------------------------------------------------------------------------
// skillSchema (the union itself)
// ---------------------------------------------------------------------------

test("skillSchema accepts a plain string", () => {
    assert.equal(skillSchema.parse("React"), "React")
})

test("skillSchema accepts a valid object", () => {
    const parsed = skillSchema.parse({
        name: "Node.js",
        source: "self",
        sourceRef: "side project",
    })
    assert.equal((parsed as any).name, "Node.js")
})

test("skillSchema rejects an object missing sourceRef", () => {
    assert.throws(() =>
        skillSchema.parse({ name: "X", source: "self" })
    )
})

test("skillSchema rejects a 0-length string", () => {
    assert.throws(() => skillSchema.parse(""))
})

// ---------------------------------------------------------------------------
// addCourseBodySchema (multipart-style strings)
// ---------------------------------------------------------------------------

test("addCourseBodySchema coerces multipart string booleans and dates", () => {
    const parsed = addCourseBodySchema.parse({
        name: "TypeScript Basics",
        startDate: "2025-01-01T00:00:00Z",
        endDate: "2025-06-01T00:00:00Z",
        present: "false",
        description: "Intro course",
    })
    assert.equal(parsed.name, "TypeScript Basics")
    assert.equal(parsed.present, false)
    assert.ok(parsed.startDate instanceof Date)
})

test("addCourseBodySchema accepts 'true' as present", () => {
    const parsed = addCourseBodySchema.parse({
        name: "Course in progress",
        present: "true",
    })
    assert.equal(parsed.present, true)
})

test("addCourseBodySchema accepts null endDate", () => {
    const parsed = addCourseBodySchema.parse({
        name: "Long Course Name",
        endDate: null,
    })
    assert.equal(parsed.endDate, null)
})

test("addCourseBodySchema rejects a 1-char name", () => {
    assert.throws(() => addCourseBodySchema.parse({ name: "A" }))
})

// ---------------------------------------------------------------------------
// updateCourseBodySchema (everything optional)
// ---------------------------------------------------------------------------

test("updateCourseBodySchema accepts an empty object (controller checks 'nothing to update')", () => {
    // The schema is permissive — it does not require any field. The
    // controller layer raises a 400 "nothing to update" so we don't
    // bake that into the schema (Zod can't easily express "at least
    // one of these optional fields must be set").
    const parsed = updateCourseBodySchema.parse({})
    assert.deepEqual(parsed, {})
})

test("updateCourseBodySchema coerces present from multipart", () => {
    const parsed = updateCourseBodySchema.parse({ present: "true" })
    assert.equal(parsed.present, true)
})
