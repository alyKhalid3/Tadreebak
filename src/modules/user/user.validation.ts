import { z } from "zod";
import { SkillSourceEnum } from "../../DB/types/user.type";

const fileReferenceSchema = z.object({
    public_id: z.string().min(1),
    secure_url: z.string().url(),
    resourceType: z.enum(['image', 'raw']).optional(),
})

/**
 * Skill entry — two accepted shapes:
 *   - plain string ("React")
 *   - object with source + sourceRef + optional description
 *
 * Backward compatible: clients that still send `string[]` keep working.
 * New writes should prefer the object form. We don't use `.strict()` so
 * any extra keys on the object form are silently stripped (matches
 * Zod v4's default strip mode — see PLATFORM_REDESIGN).
 */
const skillSourceEnum = z.enum([
    SkillSourceEnum.SELF,
    SkillSourceEnum.EDUCATION,
    SkillSourceEnum.INTERNSHIP,
    SkillSourceEnum.OTHER,
])

const skillObjectSchema = z.object({
    name: z.string().trim().min(1).max(80),
    source: skillSourceEnum,
    sourceRef: z.string().trim().min(1).max(200),
    description: z.string().max(500).optional(),
})

export const skillSchema = z.union([
    z.string().trim().min(1).max(80),
    skillObjectSchema,
])

/**
 * Multipart form bodies arrive with strings, so dates are coerced and
 * booleans are translated from `"true"` / `"false"` / real booleans.
 */
const optionalBool = z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((v) => v === true || v === 'true' || v === '1')
    .optional()

const optionalDate = z.coerce.date().optional()
const optionalNullableDate = z.coerce.date().optional().nullable()

const courseSchema = z.object({
    name: z.string().trim().min(2).max(100),
    certificate: fileReferenceSchema.optional(),
    startDate: optionalDate,
    endDate: optionalNullableDate,
    present: z.boolean().optional(),
    description: z.string().max(1000).optional(),
})

const educationItemSchema = z.object({
    institution: z.string(),
    degree: z.string(),
    field: z.string(),
    grade: z.string(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    description: z.string().max(1000).optional(),
})

/**
 * Public social link. `platform` is free-text so the frontend can
 * render any network (LinkedIn / GitHub / Behance / personal site).
 * `url` is required and must be a parseable URL.
 */
const socialItemSchema = z.object({
    platform: z.string().trim().min(1).max(50),
    url: z.string().url(),
})

export const updateProfileSchema = z.object({
    firstName: z.string().min(3).max(20).optional(),
    lastName: z.string().min(3).max(20).optional(),
    phone: z.string().optional(),
    bio: z.string().max(500).optional(),
    headline: z.string().max(100).optional(),
    // Accept both string and object entries in the same array
    // (backward-compat — see PLATFORM_REDESIGN §"Skills shape").
    skills: z.array(skillSchema).max(50).optional(),
    categories: z.array(z.string().trim().min(1).max(50)).max(4).optional(),
    courses: z.array(courseSchema).max(20).optional(),
    dateOfBirth: z.string().datetime().optional(),
    gender: z.enum(['male', 'female']).optional(),
    address: z.string().optional(),
    education: z.array(educationItemSchema).optional(),
    socials: z.array(socialItemSchema).max(10).optional(),
    experience: z.never().optional(),
})

/**
 * Body for `POST /user/courses` — multipart form fields. The
 * `file` is handled by multer and isn't part of this schema. Date
 * and boolean coercion are applied because multipart fields are
 * always strings.
 */
export const addCourseBodySchema = z.object({
    name: z.string().trim().min(2).max(100),
    startDate: optionalDate,
    endDate: optionalNullableDate,
    present: optionalBool,
    description: z.string().max(1000).optional(),
})

/**
 * Body for `PATCH /user/courses/:courseIndex`. All fields
 * optional — send only what changes.
 */
export const updateCourseBodySchema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    startDate: optionalDate,
    endDate: optionalNullableDate,
    present: optionalBool,
    description: z.string().max(1000).optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type AddCourseBody = z.infer<typeof addCourseBodySchema>
export type UpdateCourseBody = z.infer<typeof updateCourseBodySchema>
