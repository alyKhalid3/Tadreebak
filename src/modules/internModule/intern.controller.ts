import { Router } from "express";
import { InternService } from "./intern.service";
import { validation } from "../../middleware/validation.middleware";
import * as InternValidation from "./intern.validation";
import { auth } from "../../middleware/authentication.middleware";
import { AuthZMiddleware } from "../../middleware/authorization.middleware";
import { UserRoleEnum } from "../../DB/types/user.type";
import { applicationRouter } from "../applicationModule";
import { invitesRouter } from "./invites.controller";

export const internRoutes = {
    base: '/internships',
    list: '/',
    saved: '/saved',
    save: '/:internId/save',
    unsave: '/:internId/save',
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
 *     description: |
 *       Each list item is now enriched with an `applicantsCount`
 *       integer (Phase 11 / P2 #E1). Previously the front-end
 *       had to issue N parallel requests to derive this number
 *       per posting — the backend now joins applications in one
 *       round trip via
 *       `ApplicationModel.aggregate({ $group: { _id: internshipId, count } })`.
 *
 *       Cached for 5 min under `internships:list:{queryHash}`;
 *       busted on application create / cancel via
 *       `application.service`.
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
 * /internships/saved:
 *   get:
 *     summary: List the authenticated student's saved internships
 *     description: Returns the internships the student has bookmarked, newest first.
 *     tags: [Internships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: string
 *           default: "1"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *           default: "10"
 *         description: Items per page (max 50)
 *     responses:
 *       200:
 *         description: Saved internships fetched successfully
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
 *                         page: { type: integer }
 *                         limit: { type: integer }
 *                         total: { type: integer }
 *                         pages: { type: integer }
 *                 msg: { type: string }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Student role required
 */
router.get(internRoutes.saved, auth(), AuthZMiddleware([UserRoleEnum.STUDENT]), validation(InternValidation.listSavedInternQuerySchema), internService.listSavedInternships)
/**
 * @swagger
 * /internships/{internId}/save:
 *   post:
 *     summary: Save (bookmark) an internship (student only)
 *     description: Idempotent — saving the same internship twice is a no-op success.
 *     tags: [Internships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: internId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Internship saved
 *       400:
 *         description: Invalid internship id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Student role required
 *       404:
 *         description: Internship not found
 */
router.post(internRoutes.save, auth(), AuthZMiddleware([UserRoleEnum.STUDENT]), internService.saveInternship)
/**
 * @swagger
 * /internships/{internId}/save:
 *   delete:
 *     summary: Remove a saved internship bookmark (student only)
 *     description: Idempotent — removing an unsaved internship is a no-op success.
 *     tags: [Internships]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: internId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Internship removed from saved
 *       400:
 *         description: Invalid internship id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Student role required
 */
router.delete(internRoutes.unsave, auth(), AuthZMiddleware([UserRoleEnum.STUDENT]), internService.unsaveInternship)
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
 *               - track
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
 *               questions:
 *                 type: array
 *                 description: Optional internship questions (mixed MCQ and writing). Use a wholesale replace on update.
 *                 items:
 *                   oneOf:
 *                     - type: object
 *                       required:
 *                         - type
 *                         - prompt
 *                         - options
 *                       properties:
 *                         type:
 *                           type: string
 *                           enum: [mcq]
 *                         prompt:
 *                           type: string
 *                         options:
 *                           type: array
 *                           items:
 *                             type: string
 *                           minItems: 2
 *                     - type: object
 *                       required:
 *                         - type
 *                         - prompt
 *                       properties:
 *                         type:
 *                           type: string
 *                           enum: [writing]
 *                         prompt:
 *                           type: string
 *               preKnowledge:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional list of pre-knowledge topics sent to the student in the acceptance email.
 *               track:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 description: Required internship tracks used to match and notify interested students.
 *               requiredEducation:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     institution:
 *                       type: string
 *                     degree:
 *                       type: string
 *                     field:
 *                       type: string
 *                     grade:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
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
companyRouter.post('/', auth(), AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]), validation(InternValidation.createInternSchema), internService.create)
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
 *               questions:
 *                 type: array
 *                 description: Optional internship questions (mixed MCQ and writing). Replaces the full array.
 *                 items:
 *                   oneOf:
 *                     - type: object
 *                       required:
 *                         - type
 *                         - prompt
 *                         - options
 *                       properties:
 *                         type:
 *                           type: string
 *                           enum: [mcq]
 *                         prompt:
 *                           type: string
 *                         options:
 *                           type: array
 *                           items:
 *                             type: string
 *                           minItems: 2
 *                     - type: object
 *                       required:
 *                         - type
 *                         - prompt
 *                       properties:
 *                         type:
 *                           type: string
 *                           enum: [writing]
 *                         prompt:
 *                           type: string
 *               preKnowledge:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional list of pre-knowledge topics sent to the student in the acceptance email. Replaces the full array.
 *               track:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 description: Required internship tracks used to match and notify interested students.
 *               requiredEducation:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     institution:
 *                       type: string
 *                     degree:
 *                       type: string
 *                     field:
 *                       type: string
 *                     grade:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
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
companyRouter.put('/:internId', auth(), AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]), validation(InternValidation.updateInternSchema), internService.update)
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
companyRouter.delete('/:internId', auth(), AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]), internService.delete)
/**
 * @swagger
 * /company/{companyId}/internships/{internId}/close:
 *   patch:
 *     summary: Close an internship (company owner only)
 *     description: |
 *       Marks the internship as closed. It disappears from the default public
 *       listing (`GET /internships`) and can no longer accept new
 *       applications. Existing applications are kept. Reopen with the reopen
 *       endpoint.
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
 *         description: Internship closed successfully
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
 *         description: Invalid internship id / internship is already closed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: You are not the owner of this internship's company
 *       404:
 *         description: Internship not found
 */
companyRouter.patch('/:internId/close', auth(), AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]), internService.close)
/**
 * @swagger
 * /company/{companyId}/internships/{internId}/reopen:
 *   patch:
 *     summary: Reopen a closed internship (company owner only)
 *     description: Marks a closed internship as open again so it reappears in the public listing and accepts applications.
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
 *         description: Internship reopened successfully
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
 *         description: Invalid internship id / internship is already open
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: You are not the owner of this internship's company
 *       404:
 *         description: Internship not found
 */
companyRouter.patch('/:internId/reopen', auth(), AuthZMiddleware([UserRoleEnum.COMPANY_OWNER]), internService.reopen)

// Internship applications — inherits :companyId and :internId via mergeParams.
// Exposes POST/GET on /:internId/applications and PATCH/DELETE on /:internId/applications/:applicationId.
companyRouter.use('/:internId/applications', applicationRouter)
// Phase 9 (P2): admin invites a student to an internship.
// POST / GET / DELETE. Student-side accept/decline deferred.
companyRouter.use('/:internId/invites', invitesRouter)

export { companyRouter }
export default router
