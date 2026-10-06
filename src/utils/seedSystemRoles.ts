// Phase 18B / Seed the built-in roles for a new company.
//
// Two built-in roles per company:
//   - **Owner** (`isSystem: true`, `isOwnerRole: true`):
//     Every permission in the registry. The check
//     `assertStaffPermission` short-circuits to a bypass when
//     `role.isOwnerRole === true`, so the Owner role is special
//     — its permission array is informational and doesn't drive
//     any access check.
//   - **Instructor** (`isSystem: true`, `isOwnerRole: false`):
//     The Phase 18 instructor perm set, now expressed as
//     explicit permission keys. Customisable by the company
//     (name is locked, perms are editable).
//
// Idempotent: re-running the seed (e.g. on a company that
// predates Phase 18B) is a no-op — `findOne + create` race-
// guards against the unique index. Use this on:
//   - Company creation (called from company.service.create)
//   - Migration script for legacy companies
import { Types } from "mongoose"
import { CompanyRoleModel } from "../DB/models/companyRole.model"
import {
    getAllPermissionKeys,
    INSTRUCTOR_DEFAULT_PERMISSIONS,
} from "./permissions"

export const seedSystemRoles = async (companyId: Types.ObjectId | string): Promise<void> => {
    const cid = typeof companyId === 'string' ? new Types.ObjectId(companyId) : companyId

    // Owner role — every permission. `isOwnerRole: true` makes
    // it a special-case that bypasses the per-permission check.
    const existingOwner = await CompanyRoleModel.findOne({ companyId: cid, name: 'Owner' })
    if (!existingOwner) {
        await CompanyRoleModel.create({
            companyId: cid,
            name: 'Owner',
            description: 'Implicit — every permission. The company creator.',
            permissions: getAllPermissionKeys(),
            isSystem: true,
            isOwnerRole: true,
        })
    }

    // Instructor role — Phase 18 default perms, editable.
    const existingInstructor = await CompanyRoleModel.findOne({ companyId: cid, name: 'Instructor' })
    if (!existingInstructor) {
        await CompanyRoleModel.create({
            companyId: cid,
            name: 'Instructor',
            description: 'Manages students at the company — tasks, attendance, evaluations, applicant review.',
            permissions: INSTRUCTOR_DEFAULT_PERMISSIONS,
            isSystem: true,
            isOwnerRole: false,
        })
    }
}