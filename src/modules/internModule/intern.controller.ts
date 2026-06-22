import { Router } from "express";
import { InternService } from "./intern.service";
import { validation } from "../../middleware/validation.middleware";
import * as InternValidation from "./intern.validation";
import { auth } from "../../middleware/authentication.middleware";

export const internRoutes = {
    base: '/internships',
    list: '/',
    getInternById: '/:internId',
}

const internService = new InternService()

// Public router — no auth
const router = Router()
/**
 * @swagger
 * /internships:
 *   get:
 *     summary: List all internships
 *     tags: [Internships]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [full-time, part-time]
 *         description: Filter by working time
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *           enum: [on-site, remote, hybrid]
 *         description: Filter by location
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: string
 *         description: Filter by company ID
 *       - in: query
 *         name: title
 *         schema:
 *           type: string
 *         description: Search by title (case-insensitive)
 *       - in: query
 *         name: closed
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by closed status
 *       - in: query
 *         name: page
 *         schema:
 *           type: string
 *           default: "1"
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *           default: "10"
 *         description: Items per page (max 50)
 *     responses:
 *       200:
 *         description: Internships fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     internships:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Internship'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *                 msg:
 *                   type: string
 */
router.get(internRoutes.list, validation(InternValidation.listInternQuerySchema), internService.list)
/**
 * @swagger
 * /internships/{internId}:
 *   get:
 *     summary: Get an internship by ID
 *     tags: [Internships]
 *     parameters:
 *       - in: path
 *         name: internId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Internship fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     internship:
 *                       $ref: '#/components/schemas/Internship'
 *                 msg:
 *                   type: string
 *       400:
 *         description: Invalid internship id
 *       404:
 *         description: Internship not found
 */
router.get(internRoutes.getInternById, internService.getInternById)

// Company-scoped router — auth + mergeParams
const companyRouter = Router({ mergeParams: true })
/**
 * @swagger
 * /company/{companyId}/internships:
 *   post:
 *     summary: Create an internship for a company
 *     tags: [Internships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - location
 *               - workingTime
 *               - softSkills
 *               - technicalSkills
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 minLength: 10
 *               location:
 *                 type: string
 *                 enum: [on-site, remote, hybrid]
 *               workingTime:
 *                 type: string
 *                 enum: [full-time, part-time]
 *               softSkills:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *               technicalSkills:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *     responses:
 *       201:
 *         description: Internship created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     internship:
 *                       $ref: '#/components/schemas/Internship'
 *                 msg:
 *                   type: string
 *       400:
 *         description: Invalid company id / validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: You are not the owner of this company
 *       404:
 *         description: Company not found
 */
companyRouter.post('/', auth(), validation(InternValidation.createInternSchema), internService.create)
/**
 * @swagger
 * /company/{companyId}/internships/{internId}:
 *   put:
 *     summary: Update an internship
 *     tags: [Internships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: internId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               location:
 *                 type: string
 *                 enum: [on-site, remote, hybrid]
 *               workingTime:
 *                 type: string
 *                 enum: [full-time, part-time]
 *               softSkills:
 *                 type: array
 *                 items:
 *                   type: string
 *               technicalSkills:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Internship updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     internship:
 *                       $ref: '#/components/schemas/Internship'
 *                 msg:
 *                   type: string
 *       400:
 *         description: Invalid internship id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: You are not the owner of this internship's company
 *       404:
 *         description: Internship not found
 */
companyRouter.put('/:internId', auth(), validation(InternValidation.updateInternSchema), internService.update)
/**
 * @swagger
 * /company/{companyId}/internships/{internId}:
 *   delete:
 *     summary: Delete an internship
 *     tags: [Internships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: internId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Internship deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                 msg:
 *                   type: string
 *       400:
 *         description: Invalid internship id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: You are not the owner of this internship's company
 *       404:
 *         description: Internship not found
 */
companyRouter.delete('/:internId', auth(), internService.delete)

export { companyRouter }
export default router
