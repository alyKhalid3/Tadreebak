// Phase 12 / P2 #5 — Save Companies controller.
//
// Mirrors the saved-internships controller shape:
//   - POST   /companies/:id/save   → 201 idempotent
//   - DELETE /companies/:id/save   → 200 idempotent
//   - GET    /companies/saved       → { companies, pagination }
//
// All three routes require an authenticated STUDENT. The role
// guard is mounted at the router level via AuthZMiddleware.

import { Router } from "express"
import { validation } from "../../middleware/validation.middleware"
import { auth } from "../../middleware/authentication.middleware"
import { AuthZMiddleware } from "../../middleware/authorization.middleware"
import { UserRoleEnum } from "../../DB/types/user.type"
import { SavedCompaniesService } from "./savedCompanies.service"
import {
    companyIdParamSchema,
    listSavedCompaniesQuerySchema,
} from "./savedCompanies.validation"

const savedCompaniesService = new SavedCompaniesService()
const savedCompaniesRouter = Router()

// Auth + role gate — only students bookmark companies.
savedCompaniesRouter.use(auth(), AuthZMiddleware([UserRoleEnum.STUDENT]))

/**
 * @swagger
 * /companies/{id}/save:
 *   post:
 *     summary: Save (bookmark) a company (student only)
 *     description: |
 *       Idempotent — saving the same company twice is a no-op
 *       success. 404 if the company doesn't exist (the company
 *       can be in any approval state — pending / banned / soft-
 *       deleted all return 404 to keep the bookmark list clean).
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Company saved
 *       400:
 *         description: Invalid company id
 *       401:
 *         description: Missing or invalid bearer token
 *       403:
 *         description: Student role required
 *       404:
 *         description: Company not found
 */
savedCompaniesRouter.post(
    '/:id/save',
    validation(companyIdParamSchema, 'params'),
    savedCompaniesService.save,
)

/**
 * @swagger
 * /companies/{id}/save:
 *   delete:
 *     summary: Remove a saved-company bookmark (student only)
 *     description: |
 *       Idempotent — removing an unsaved company is a no-op
 *       success. No 404 if the row was missing.
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Company removed from saved
 *       400:
 *         description: Invalid company id
 *       401:
 *         description: Missing or invalid bearer token
 *       403:
 *         description: Student role required
 */
savedCompaniesRouter.delete(
    '/:id/save',
    validation(companyIdParamSchema, 'params'),
    savedCompaniesService.unsave,
)

/**
 * @swagger
 * /companies/saved:
 *   get:
 *     summary: List the authenticated student's saved companies
 *     description: |
 *       Returns the companies the student has bookmarked, newest
 *       first. Each item is the populated company document (no
 *       `legalAttachment`). Pagination supported.
 *
 *       Cached for 60 s under
 *       `companies:saved:{studentId}:{queryHash}`. Cache is
 *       busted when a save / unsave fires.
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *     responses:
 *       200:
 *         description: Saved companies fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     companies:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Company' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *                 msg: { type: string }
 *       401:
 *         description: Missing or invalid bearer token
 *       403:
 *         description: Student role required
 */
savedCompaniesRouter.get(
    '/saved',
    validation(listSavedCompaniesQuerySchema, 'query'),
    savedCompaniesService.list,
)

export { savedCompaniesRouter }
