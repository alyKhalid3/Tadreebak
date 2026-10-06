// Phase 18B / Roles service.
//
// Owner-only CRUD for `CompanyRole`. Built-in roles
// (`isSystem: true`) cannot be deleted; the Owner role
// (`isOwnerRole: true`) cannot be edited at all (besides
// `description`). Custom roles can be deleted only when
// no current staff membership references them.
//
// Cross-company guard: every operation scopes the role
// to the `companyId` in the path. A role id from a
// different company surfaces as 404.
import { NextFunction, Request, Response } from "express"
import mongoose, { isObjectIdOrHexString } from "mongoose"
import { CompanyRoleModel } from "../../../DB/models/companyRole.model"
import { UserModel } from "../../../DB/models/user.model"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { PermissionKey } from "../../../utils/permissions"
import { cacheFlushPrefix } from "../../../cache/cache"

// Cache key: the staff list reads role metadata, so role
// mutations flush this prefix so a freshly-edited role
// surfaces within the cache window.
const STAFF_LIST_PREFIX = (companyId: string) => `staff:list:${companyId}`

export class RolesService {
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            const { includeSystem } = req.query as { includeSystem?: boolean }
            const filter: Record<string, any> = { companyId: new mongoose.Types.ObjectId(companyId as string) }
            if (!includeSystem) filter.isSystem = { $ne: true }

            const roles = await CompanyRoleModel.find(filter).sort({ name: 1 }).lean()
            return successHandler({
                res,
                message: 'Roles fetched successfully',
                data: { roles },
            })
        } catch (err) {
            next(err)
        }
    }

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            const { name, description, permissions } = req.body as {
                name: string
                description?: string
                permissions: PermissionKey[]
            }

            // Reserved names — the seed reserved them for built-in
            // roles; the unique-on-(companyId, name) index would
            // 409 anyway, but a friendly 400 is better UX than an
            // opaque duplicate-key error.
            const RESERVED = ['Owner', 'Instructor']
            if (RESERVED.includes(name)) {
                throw new ApplicationError(
                    `'${name}' is a reserved role name. Pick a different name`,
                    400,
                )
            }

            try {
                const role = await CompanyRoleModel.create({
                    companyId: new mongoose.Types.ObjectId(companyId as string),
                    name,
                    ...(description ? { description } : {}),
                    permissions,
                    isSystem: false,
                    isOwnerRole: false,
                })
                await cacheFlushPrefix(STAFF_LIST_PREFIX(companyId as string))
                return successHandler({
                    res,
                    status: 201,
                    message: 'Role created',
                    data: { role },
                })
            } catch (err: any) {
                if (err && err.code === 11000) {
                    throw new ApplicationError(
                        `A role named '${name}' already exists at this company`,
                        409,
                    )
                }
                throw err
            }
        } catch (err) {
            next(err)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, roleId } = req.params
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            if (!isObjectIdOrHexString(roleId)) {
                throw new ApplicationError('Invalid role id', 400)
            }

            const role = await CompanyRoleModel.findById(roleId)
            if (!role) throw new NotFoundException('Role not found')
            if (role.companyId.toString() !== companyId) {
                // Cross-company access by id — same 404 to avoid
                // leaking the existence of other companies' roles.
                throw new NotFoundException('Role not found')
            }
            if (role.isOwnerRole) {
                throw new ApplicationError(
                    'The Owner role cannot be edited (its permissions are implicit)',
                    400,
                )
            }

            const { name, description, permissions } = req.body as {
                name?: string
                description?: string
                permissions?: PermissionKey[]
            }
            if (name !== undefined && role.isSystem && name !== role.name) {
                throw new ApplicationError(
                    'Built-in role names cannot be changed',
                    400,
                )
            }
            if (name !== undefined) role.name = name
            if (description !== undefined) role.description = description
            if (permissions !== undefined) role.permissions = permissions

            await role.save()
            await cacheFlushPrefix(STAFF_LIST_PREFIX(companyId as string))
            // User caches too — the role's permission set may have
            // changed, so a staff member with this role needs the
            // auth middleware to re-read their next request.
            await UserModel.updateMany(
                { 'staffMembership.roleId': role._id },
                { $set: { isChangeCredentialsUpdated: new Date() } },
            )

            return successHandler({
                res,
                message: 'Role updated',
                data: { role },
            })
        } catch (err) {
            next(err)
        }
    }

    remove = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId, roleId } = req.params
            const user = res.locals.user
            await assertOwnedCompany(companyId as string, user._id.toString())

            if (!isObjectIdOrHexString(roleId)) {
                throw new ApplicationError('Invalid role id', 400)
            }

            const role = await CompanyRoleModel.findById(roleId)
            if (!role) throw new NotFoundException('Role not found')
            if (role.companyId.toString() !== companyId) {
                throw new NotFoundException('Role not found')
            }
            if (role.isSystem) {
                throw new ApplicationError(
                    'Built-in roles cannot be deleted',
                    400,
                )
            }

            // Refuse if any staff member is currently using this role —
            // a deletion would leave them with no permissions and
            // every subsequent route would 403 them silently.
            const inUse = await UserModel.countDocuments({
                'staffMembership.roleId': role._id,
                'staffMembership.status': 'active',
            })
            if (inUse > 0) {
                throw new ApplicationError(
                    `Cannot delete: ${inUse} staff member${inUse === 1 ? '' : 's'} currently use this role. Reassign them first`,
                    409,
                )
            }

            await role.deleteOne()
            await cacheFlushPrefix(STAFF_LIST_PREFIX(companyId as string))
            return successHandler({
                res,
                message: 'Role deleted',
            })
        } catch (err) {
            next(err)
        }
    }
}

export const rolesService = new RolesService()