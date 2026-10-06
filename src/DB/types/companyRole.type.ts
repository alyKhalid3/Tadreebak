// Phase 18B / CompanyRole type.
//
// A role is a named bag of permissions that staff can be
// assigned to. Per-company — each company defines its own
// roles (Owner + Instructor are seeded for every new company).
//
// Two special-case flags:
//   - `isSystem`: true for Owner / Instructor. These can't be
//     deleted. The Instructor role's permissions CAN be edited
//     (the company may want to narrow it), but the role record
//     itself is locked.
//   - `isOwnerRole`: true for the Owner role only. This bypasses
//     the permission check entirely so the owner doesn't have to
//     be re-issued when new permissions are added to the registry.
import { Types } from "mongoose"
import { PermissionKey } from "../../utils/permissions"

export interface ICompanyRole {
    companyId: Types.ObjectId
    name: string
    description?: string
    // The permission array. Validated at write time against the
    // hardcoded PERMISSIONS registry in `utils/permissions.ts` —
    // unknown permission strings are refused with 400.
    permissions: PermissionKey[]
    isSystem: boolean
    isOwnerRole: boolean
}