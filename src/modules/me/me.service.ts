// Phase 19 / "My permissions" service.
//
// One-call endpoint for the front-end to discover what the
// currently-logged-in user can do across every company they're
// associated with — staff role + permissions, OR owner bypass
// (every permission) for companies they own.
//
// Replaces the previous two-call pattern the front-end had to do:
//   1) GET /user/:id                  → staffMembership[].roleId
//   2) GET /company/:id/roles/:roleId → permissions[]
// The second call was also owner-only (`assertOwnedCompany` gate),
// so a non-owner staff user (e.g. an HR Lead) was locked out from
// reading their own permissions. The new endpoint reads the role
// doc directly (no owner check) and is callable by anyone logged in.
//
// Owner-bypass semantics: a user where
//   Company.createdBy.toString() === user._id.toString()
// has every permission at that company, regardless of what the
// role record says. We expand that to `effectivePermissions: all 26
// keys` so the front-end can treat the field uniformly — no
// special-case for isOwner.
//
// Active-only: soft-revoked staff and removed memberships don't
// surface in `companies[]`. The user's own data still has the
// full `staffMembership[]` (audit trail); we just don't expose the
// removed rows here.

import { NextFunction, Request, Response } from "express"
import mongoose, { Types } from "mongoose"
import { companyModel } from "../../DB/models/company.model"
import { CompanyRoleModel } from "../../DB/models/companyRole.model"
import { UserRepo } from "../../DB/repos/user.repo"
import { successHandler } from "../../utils/successHandler"
import { getAllPermissionKeys, PermissionKey } from "../../utils/permissions"

const userRepo = new UserRepo()

// Cache key: short TTL, scoped to the user. Flushed on:
//   - staff invite / remove (RolesService + InstructorsService)
//   - role create / update / delete (RolesService.update)
//   - any change to user.staffMembership[] (rare — invites/removes)
// 30s is enough to absorb "front-end reads per page navigation"
// without letting a stale role linger if a permission was just
// revoked. The DB read itself is two queries; no perf concern.
const cacheKey = (userId: string) => `me:permissions:${userId}`

// Bypass the cache for the underlying repo reads — the user
// might have had their role / membership changed in the last
// 60s. A stale 30s cache on top of an already-stale user
// read is two layers of wrong.
async function loadUserLive(userId: string) {
    return userRepo.findById({ id: userId })
}

async function loadOwnedCompanies(userId: string) {
    // Returns a thin projection — just what the response needs.
    return companyModel
        .find({
            createdBy: new Types.ObjectId(userId),
            deletedAt: null,
            bannedAt: null,
        })
        .select("name logo")
        .lean()
}

async function loadStaffCompanies(userId: string) {
    // Pull the user, then collect every active membership's
    // companyId. One User read, one Company $in lookup — no N+1.
    const user = await loadUserLive(userId)
    if (!user) return { user, companyIds: [] as string[] }
    const companyIds = (user.staffMembership ?? [])
        .filter((m: any) => m.status === "active")
        .map((m: any) => m.companyId?.toString())
        .filter(Boolean) as string[]
    return { user, companyIds }
}

async function loadCompanies(companyIds: string[]) {
    if (companyIds.length === 0) return [] as any[]
    return companyModel
        .find({ _id: { $in: companyIds.map((id) => new Types.ObjectId(id)) } })
        .select("name logo")
        .lean()
}

async function loadRolesByIds(roleIds: string[]) {
    if (roleIds.length === 0) return [] as any[]
    return CompanyRoleModel.find({ _id: { $in: roleIds.map((id) => new Types.ObjectId(id)) } }).lean()
}

export class MeService {
    permissions = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const userId = user._id.toString()

            // 1. Load the user (with active memberships) + every
            //    company they own. Two parallel reads.
            const [userDoc, ownedCompanies] = await Promise.all([
                loadUserLive(userId),
                loadOwnedCompanies(userId),
            ])
            if (!userDoc) {
                // Shouldn't happen — the auth middleware requires
                // a valid user. Defensive 401 just in case the
                // cache was stale.
                return res.status(401).json({ message: "User not found" })
            }

            // 2. Collect the companyIds the user is staff at
            //    (active-only). Then bulk-load the company docs
            //    + role docs so the front-end gets names + perms
            //    in one shot.
            const { companyIds: staffCompanyIds } = await loadStaffCompanies(userId)

            // Union of (owned + staff) companyIds for the $in
            // fetch — owned companies may overlap with the staff
            // list (degenerate case but legal).
            const allCompanyIds = Array.from(
                new Set([
                    ...ownedCompanies.map((c: any) => c._id.toString()),
                    ...staffCompanyIds,
                ]),
            )

            const [staffCompanyDocs, roleDocs] = await Promise.all([
                loadCompanies(staffCompanyIds),
                loadRolesByIds(
                    Array.from(
                        new Set(
                            (userDoc.staffMembership ?? [])
                                .filter((m: any) => m.status === "active")
                                .map((m: any) => m.roleId?.toString())
                                .filter(Boolean) as string[],
                        ),
                    ),
                ),
            ])

            // Build lookup maps so the per-company projection is
            // O(1) per row.
            const companyById = new Map<string, any>()
            for (const c of [...ownedCompanies, ...staffCompanyDocs]) {
                companyById.set(c._id.toString(), c)
            }
            const roleById = new Map<string, any>()
            for (const r of roleDocs) {
                roleById.set(r._id.toString(), r)
            }

            // 3. Build the response. Order: owned companies first
            //    (most permissions), then staff companies.
            const allPerms = getAllPermissionKeys()
            const companies: any[] = []

            for (const owned of ownedCompanies) {
                const cid = owned._id.toString()
                // Owner: every permission is implicit. We still
                // surface the role (Owner) for badge rendering.
                const ownerRole = roleDocs.find(
                    (r: any) => r.companyId?.toString() === cid && r.isOwnerRole === true,
                )
                companies.push({
                    companyId: cid,
                    companyName: owned.name,
                    companyLogo: owned.logo ?? null,
                    isOwner: true,
                    membership: null,
                    role: ownerRole
                        ? {
                              _id: ownerRole._id,
                              name: ownerRole.name,
                              isSystem: ownerRole.isSystem,
                              isOwnerRole: ownerRole.isOwnerRole,
                          }
                        : { name: "Owner", isSystem: true, isOwnerRole: true },
                    effectivePermissions: allPerms,
                })
            }

            for (const m of (userDoc.staffMembership ?? []).filter(
                (m: any) => m.status === "active",
            )) {
                const cid = m.companyId.toString()
                const company = companyById.get(cid)
                if (!company) {
                    // The membership references a company that
                    // doesn't exist (shouldn't happen, but
                    // defensive). Skip — we don't want to leak
                    // a 500.
                    continue
                }
                const role = m.roleId ? roleById.get(m.roleId.toString()) : null
                companies.push({
                    companyId: cid,
                    companyName: company.name,
                    companyLogo: company.logo ?? null,
                    isOwner: false,
                    membership: {
                        status: m.status,
                        joinedAt: m.joinedAt,
                        removedAt: m.removedAt ?? null,
                    },
                    role: role
                        ? {
                              _id: role._id,
                              name: role.name,
                              description: role.description ?? null,
                              isSystem: role.isSystem,
                              isOwnerRole: role.isOwnerRole,
                              permissions: role.permissions,
                          }
                        : null,
                    // For staff, effective = role.permissions
                    // exactly. (No owner bypass applies here —
                    // the user is not the creator of this company.)
                    effectivePermissions: role?.permissions ?? [],
                })
            }

            return successHandler({
                res,
                message: "Permissions fetched successfully",
                data: {
                    userId,
                    role: userDoc.role,
                    companies,
                },
            })
        } catch (error) {
            next(error)
        }
    }
}

export const meService = new MeService()
