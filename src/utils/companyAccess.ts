import { isObjectIdOrHexString } from "mongoose";
import { CompanyRepo } from "../DB/repos/company.repo";
import { CompanyRoleRepo } from "../DB/repos/companyRole.repo";
import { UserRepo } from "../DB/repos/user.repo";
import { ICompany } from "../DB/types/company.type";
import { UserRoleEnum } from "../DB/types/user.type";
import { ICompanyRole } from "../DB/types/companyRole.type";
import { PermissionKey } from "./permissions";
import { ApplicationError, NotFoundException } from "./error";

const companyRepo = new CompanyRepo()
const userRepo = new UserRepo()
const companyRoleRepo = new CompanyRoleRepo()

/**
 * Verify that the given company exists, is active (not deleted/banned),
 * optionally approved, and is owned by the acting user. Returns the company
 * document so callers can use it. Shared by the intern & application services
 * to avoid duplicating the same ownership/status checks.
 *
 * @param requireApproval when true (default) the company must also be approved
 *   by an admin. Company creation flow passes false.
 */
export const assertOwnedCompany = async (
    companyId: string,
    userId: string,
    requireApproval = true,
): Promise<ICompany> => {
    if (!isObjectIdOrHexString(companyId)) {
        throw new ApplicationError("Invalid company id", 400)
    }
    const company = await companyRepo.findById({ id: companyId })
    if (!company || company.deletedAt || company.bannedAt) {
        throw new NotFoundException("Company not found")
    }
    if (requireApproval && !company.approvedByAdmin) {
        throw new NotFoundException("Company not found")
    }
    if (company.createdBy.toString() !== userId) {
        throw new ApplicationError("You are not the owner of this company", 403)
    }
    return company
}

/**
 * Phase 18B / Per-permission staff check.
 *
 * Returns the `{ company, membership, role }` tuple when the
 * caller is allowed to perform `permission` at `companyId`:
 *
 *   1. Owner path: if the caller is the company's `createdBy`,
 *      the check is bypassed entirely. Owners always have every
 *      permission — they don't need to be re-issued when new
 *      permissions are added to the registry.
 *   2. Staff path: look up the caller's `staffMembership` for
 *      this company, then load the role, then check the role's
 *      permission array for the requested key.
 *   3. Anyone else: 403.
 *
 * The DB reads bypass the `user:{id}` cache because an admin
 * could have revoked the membership since the caller's JWT
 * was minted, and a stale cache must not let a revoked staff
 * keep acting for the 60s TTL window.
 */
export const assertStaffPermission = async (
    companyId: string,
    userId: string,
    permission: PermissionKey,
    requireApproval = true,
): Promise<{
    company: ICompany
    isOwner: boolean
    membership: any
    role: ICompanyRole | null
}> => {
    const ctx = await _assertCompanyAccess(companyId, userId, requireApproval)
    if (ctx.isOwner) {
        // Owner bypass — every permission is implicit.
        return ctx
    }
    if (!ctx.role || !ctx.role.permissions.includes(permission)) {
        throw new ApplicationError(
            `You don't have permission: ${permission}`,
            403,
        )
    }
    return ctx
}

/**
 * Backward-compat: binary owner-vs-staff check, no specific
 * permission. Kept for any callers (Phase 18 / 3) that need the
 * shape without a per-permission gate. New code should prefer
 * `assertStaffPermission(companyId, userId, '<specific-perm>')`.
 */
export const assertCompanyStaff = async (
    companyId: string,
    userId: string,
    requireApproval = true,
): Promise<{
    company: ICompany
    isOwner: boolean
    membership: any
    role: ICompanyRole | null
}> => {
    return _assertCompanyAccess(companyId, userId, requireApproval)
}

/**
 * Internal — does the binary owner-vs-staff check without
 * permission gating. Both `assertOwnedCompany` and the staff
 * helpers build on this.
 */
const _assertCompanyAccess = async (
    companyId: string,
    userId: string,
    requireApproval: boolean,
): Promise<{
    company: ICompany
    isOwner: boolean
    membership: any
    role: ICompanyRole | null
}> => {
    if (!isObjectIdOrHexString(companyId)) {
        throw new ApplicationError("Invalid company id", 400)
    }
    const company = await companyRepo.findById({ id: companyId })
    if (!company || company.deletedAt || company.bannedAt) {
        throw new NotFoundException("Company not found")
    }
    if (requireApproval && !company.approvedByAdmin) {
        throw new NotFoundException("Company not found")
    }

    // Owner path.
    if (company.createdBy.toString() === userId) {
        return { company, isOwner: true, membership: null, role: null }
    }

    // Staff path.
    const user = await userRepo.findById({ id: userId })
    if (!user) {
        throw new ApplicationError("You are not staff at this company", 403)
    }
    const membership = (user.staffMembership ?? []).find(
        (e) => e.companyId.toString() === companyId && e.status === 'active',
    )
    if (!membership) {
        throw new ApplicationError("You are not staff at this company", 403)
    }
    const role = await companyRoleRepo.findById({ id: membership.roleId.toString() })
    if (!role || role.companyId.toString() !== companyId) {
        throw new ApplicationError(
            "Your role has been removed. Ask the company owner to assign a new one",
            403,
        )
    }
    return { company, isOwner: false, membership, role }
}
