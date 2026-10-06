// Phase 18B / Roles CRUD validation.
import { z } from "zod"
import { PERMISSIONS, PermissionKey } from "../../../utils/permissions"

// The wire shape: a name + an optional description + a
// non-empty array of permission keys. Each key must be a
// member of the PERMISSIONS registry — we validate that
// here (Zod refine) so a 400 fires before the service is
// called.
export const createRoleSchema = z.object({
    name: z.string().trim().min(2).max(50),
    description: z.string().trim().max(500).optional(),
    permissions: z
        .array(z.string())
        .min(1, 'A role needs at least one permission')
        .refine(
            (keys) => keys.every((k) => Object.prototype.hasOwnProperty.call(PERMISSIONS, k)),
            { message: 'One or more permissions are not in the registry' },
        ),
})

// PATCH is partial — name / description / permissions can each
// be updated independently. An empty body is a valid no-op
// (REST-friendly: clients can send `{}` without an error). The
// same registry-validation refine runs when permissions is
// provided.
export const updateRoleSchema = z.object({
    name: z.string().trim().min(2).max(50).optional(),
    description: z.string().trim().max(500).optional(),
    permissions: z
        .array(z.string())
        .min(1, 'A role needs at least one permission')
        .refine(
            (keys) => keys.every((k) => Object.prototype.hasOwnProperty.call(PERMISSIONS, k)),
            { message: 'One or more permissions are not in the registry' },
        )
        .optional(),
})

export const listRolesQuerySchema = z.object({
    // Coerce explicitly from "true" / "false" strings (Express
    // query params come in as strings). Anything else falls back
    // to the default `true`.
    includeSystem: z
        .union([z.boolean(), z.enum(['true', 'false'])])
        .transform((v) => v === true || v === 'true')
        .default(true),
})

export type CreateRoleInput = z.infer<typeof createRoleSchema>
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>
export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>

// Re-export the permission type for service / controller code.
export type { PermissionKey }