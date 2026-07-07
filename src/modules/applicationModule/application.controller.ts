import { Router } from "express";
import { ApplicationService } from "./application.service";
import { validation } from "../../middleware/validation.middleware";
import { auth } from "../../middleware/authentication.middleware";
import * as ApplicationValidation from "./application.validation";
import { fileTypes, StoreIn, uploadFile } from "../../utils/multer/multer";
import { parseJsonField } from "../../middleware/parseJsonField.middleware";

// This router is mounted on the company-scoped internships router, so it
// must merge :companyId and :internId from the parent route.
const router = Router({ mergeParams: true })

const applicationService = new ApplicationService()

/**
 * @swagger
 * /company/{companyId}/internships/{internId}/applications:
 *   post:
 *     summary: Apply to an internship
 *     tags: [Applications]
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
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               coverLetter:
 *                 type: string
 *                 maxLength: 2000
 *               resume:
 *                 type: string
 *                 format: binary
 *                 description: Optional CV upload. If omitted, the CV on the applicant's profile is used; if that is also missing the request fails.
 *               answers:
 *                 type: string
 *                 format: json
 *                 description: >
 *                   Stringified JSON array of answers, one per internship question (in order).
 *                   Required when the internship has questions. Shapes:
 *                   [{"type":"mcq","selectedOption":"option text"}] or
 *                   [{"type":"writing","text":"response text"}]. Mixed types allowed.
 *     responses:
 *       201:
 *         description: Application submitted successfully
 *       400:
 *         description: Internship closed / resume missing / already applied / missing or invalid answers
 *       404:
 *         description: Internship not found
 */
router.post(
    '/',
    auth(),
    uploadFile({ fileType: fileTypes.pdf, storeIn: StoreIn.DISK }).single('file'),
    parseJsonField('answers'),
    validation(ApplicationValidation.createApplicationSchema),
    applicationService.create
)

/**
 * @swagger
 * /company/{companyId}/internships/{internId}/applications:
 *   get:
 *     summary: List applications for an internship (company owner only)
 *     tags: [Applications]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, rejected]
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
 *     responses:
 *       200:
 *         description: Applications fetched successfully
 *       403:
 *         description: You are not the owner of this company
 *       404:
 *         description: Internship/Company not found
 */
router.get(
    '/',
    auth(),
    applicationService.listForInternship
)

/**
 * @swagger
 * /company/{companyId}/internships/{internId}/applications/{applicationId}:
 *   patch:
 *     summary: Accept or reject an application (company owner only)
 *     tags: [Applications]
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
 *       - in: path
 *         name: applicationId
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [accepted, rejected]
 *     responses:
 *       200:
 *         description: Application reviewed successfully
 *       400:
 *         description: Application already reviewed
 *       403:
 *         description: You are not the owner of this company
 *       404:
 *         description: Application not found
 */
router.patch(
    '/:applicationId',
    auth(),
    validation(ApplicationValidation.updateApplicationStatusSchema),
    applicationService.updateStatus
)

/**
 * @swagger
 * /company/{companyId}/internships/{internId}/applications/{applicationId}:
 *   delete:
 *     summary: Cancel/withdraw a pending application (student owner only)
 *     tags: [Applications]
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
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application cancelled successfully
 *       400:
 *         description: Only pending applications can be cancelled
 *       403:
 *         description: You can only cancel your own application
 *       404:
 *         description: Application not found
 */
router.delete(
    '/:applicationId',
    auth(),
    applicationService.cancel
)

/**
 * @swagger
 * /company/{companyId}/internships/{internId}/applications/{applicationId}/send-acceptance-email:
 *   post:
 *     summary: Send an acceptance email to an accepted applicant (company owner only)
 *     tags: [Applications]
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
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Acceptance email sent successfully
 *       400:
 *         description: Application is not accepted yet
 *       403:
 *         description: You are not the owner of this company
 *       404:
 *         description: Application/Internship/Student not found
 */
router.post(
    '/:applicationId/send-acceptance-email',
    auth(),
    applicationService.sendAcceptanceEmail
)

export default router
