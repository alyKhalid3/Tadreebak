// Phase 18B / Roles CRUD controller.
//
// Owner-only. Mounted at `/company/:companyId/roles`. The
// `assertOwnedCompany` gate is the real check; routes here
// just validate the body and dispatch to the service.
import { Router } from "express"
import { auth } from "../../../middleware/authentication.middleware"
import { validation } from "../../../middleware/validation.middleware"
import {
    createRoleSchema,
    listRolesQuerySchema,
    updateRoleSchema,
} from "./roles.validation"
import { rolesService } from "./roles.service"

const router = Router({ mergeParams: true })

/**
 * @swagger
 * /company/{companyId}/roles:
 *   get:
 *     summary: List roles defined at this company (owner only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: includeSystem
 *         schema: { type: boolean, default: true }
 *     responses:
 *       200: { description: Roles listed }
 *       403: { description: Not the company owner }
 */
router.get(
    '/',
    auth(),
    validation(listRolesQuerySchema, 'query'),
    rolesService.list,
)

/**
 * @swagger
 * /company/{companyId}/roles:
 *   post:
 *     summary: Create a custom role (owner only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateRole' }
 *     responses:
 *       201: { description: Role created }
 *       400: { description: Reserved name / unknown permission }
 *       403: { description: Not the company owner }
 *       409: { description: A role with this name already exists }
 */
router.post(
    '/',
    auth(),
    validation(createRoleSchema),
    rolesService.create,
)

/**
 * @swagger
 * /company/{companyId}/roles/{roleId}:
 *   patch:
 *     summary: Update a role's name / description / permissions (owner only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateRole' }
 *     responses:
 *       200: { description: Role updated }
 *       400: { description: Owner role / built-in rename forbidden }
 *       403: { description: Not the company owner }
 *       404: { description: Role not found at this company }
 */
router.patch(
    '/:roleId',
    auth(),
    validation(updateRoleSchema),
    rolesService.update,
)

/**
 * @swagger
 * /company/{companyId}/roles/{roleId}:
 *   delete:
 *     summary: Delete a custom role (owner only)
 *     description: |
 *       Refuses with 409 if any staff member is currently using
 *       the role. Reassign them to a different role first.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Role deleted }
 *       400: { description: Built-in role cannot be deleted }
 *       403: { description: Not the company owner }
 *       404: { description: Role not found at this company }
 *       409: { description: Role is in use }
 */
router.delete(
    '/:roleId',
    auth(),
    rolesService.remove,
)

export { router as rolesRouter }

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateRole:
 *       type: object
 *       required: [name, permissions]
 *       properties:
 *         name: { type: string, minLength: 2, maxLength: 50 }
 *         description: { type: string, maxLength: 500 }
 *         permissions:
 *           type: array
 *           minItems: 1
 *           items: { type: string, example: 'tasks.create' }
 *     UpdateRole:
 *       type: object
 *       properties:
 *         name: { type: string, minLength: 2, maxLength: 50 }
 *         description: { type: string, maxLength: 500 }
 *         permissions:
 *           type: array
 *           minItems: 1
 *           items: { type: string }
 *
 *     CompanyRole:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         companyId: { type: string }
 *         name: { type: string }
 *         description: { type: string, nullable: true }
 *         permissions:
 *           type: array
 *           items: { type: string }
 *         isSystem: { type: boolean }
 *         isOwnerRole: { type: boolean }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */