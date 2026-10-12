
import { Router } from "express";
import { validation } from "../../middleware/validation.middleware";
import { CompanyService } from "./company.service";
import * as CompanyValidation from "./company.validation";
import { auth } from "../../middleware/authentication.middleware";
import { AuthZMiddleware } from "../../middleware/authorization.middleware";
import { UserRoleEnum } from "../../DB/types/user.type";
import { fileTypes, StoreIn, uploadFile } from "../../utils/multer/multer";
const router = Router();


export const companyRoutes = {
    base: '/company',
    list: '/',
    create: '/',
    getCompany: '/:companyId',
    updateCompany: '/:companyId',
    getCompanyRatings: '/:companyId/ratings',
    getCompanyByName: '/name/:name',
    uploadLogo: '/:companyId/logo',
    uploadCover: '/:companyId/coverPicture',
    // Phase 19 / Owner "submit profile for review" toggle.
    completeProfile: '/:companyId/complete-profile',
    adminPending: '/admin/pending',
    adminBan: '/admin/:companyId/ban',
    adminUnban: '/admin/:companyId/unban',
    adminApprove: '/admin/:companyId/approve',

}
const companyService = new CompanyService()


/**
 * @swagger
 * /company/:
 *   get:
 *     summary: List all companies
 *     tags: [Company]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Search by name (case-insensitive)
 *       - in: query
 *         name: industry
 *         schema:
 *           type: string
 *         description: Filter by industry
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         description: Filter by address
 *       - in: query
 *         name: companyEmail
 *         schema:
 *           type: string
 *         description: Filter by company email
 *       - in: query
 *         name: approvedByAdmin
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by admin approval status
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
 *         description: Companies fetched successfully
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
 *                       items:
 *                         $ref: '#/components/schemas/Company'
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
router.get(
    companyRoutes.list,
    validation(CompanyValidation.listCompanyQuerySchema),
    companyService.list
)
/**
 * @swagger
 * /company/:
 *   post:
 *     summary: Create a company
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               industry:
 *                 type: string
 *               address:
 *                 type: string
 *               location:
 *                 type: string
 *                 description: Optional coordinates as a JSON string, e.g. {"lat":30.0444,"lng":31.2357}
 *               numberOfEmployees:
 *                 type: string
 *               companyEmail:
 *                 type: string
 *                 format: email
 *               legalAttachment:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Company created successfully
 *       400:
 *         description: Company name or email already exists / validation errors
 */
router.post(
    companyRoutes.create, auth(),
    AuthZMiddleware([UserRoleEnum.STUDENT, UserRoleEnum.COMPANY_OWNER]),
    uploadFile({ fileType: fileTypes.pdf, storeIn: StoreIn.DISK }).single('legalAttachment'),
    validation(CompanyValidation.createCompany),
    companyService.create
)
/**
 * @swagger
 * /company/{companyId}:
 *   patch:
 *     summary: Update a company
 *     tags: [Company]
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
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               industry:
 *                 type: string
 *               address:
 *                 type: string
 *               location:
 *                 type: object
 *                 description: Optional coordinates
 *                 properties:
 *                   lat:
 *                     type: number
 *                     minimum: -90
 *                     maximum: 90
 *                   lng:
 *                     type: number
 *                     minimum: -180
 *                     maximum: 180
 *               numberOfEmployees:
 *                 type: string
 *               companyEmail:
 *                 type: string
 *                 format: email
 *               website:
 *                 type: string
 *                 format: uri
 *                 description: 'Phase 10 (P2 #D). Company homepage. Optional.'
 *               linkedin:
 *                 type: string
 *                 format: uri
 *                 description: 'Phase 10 (P2 #D). LinkedIn profile URL. Optional.'
 *               headline:
 *                 type: string
 *                 maxLength: 200
 *                 description: 'Phase 10 (P2 #D). One-line tagline shown under the company name.'
 *               foundedYear:
 *                 type: integer
 *                 minimum: 1800
 *                 maximum: 2100
 *                 description: 'Phase 10 (P2 #D). 4-digit year the company was founded. Optional.'
 *     responses:
 *       200:
 *         description: Company updated successfully
 *       400:
 *         description: Invalid company id / validation errors
 *       404:
 *         description: Company not found
 */
/**
 * @swagger
 * /company/{companyId}:
 *   get:
 *     summary: Get a company by ID
 *     tags: [Company]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Company fetched successfully
 *       400:
 *         description: Invalid company id
 *       404:
 *         description: Company not found
 */
router.get(
    companyRoutes.getCompany,
    companyService.getCompany
)
router.patch(
    companyRoutes.updateCompany,
    auth(),
    validation(CompanyValidation.updateCompany),
    companyService.updateCompany
)

/**
 * @swagger
 * /company/{companyId}/complete-profile:
 *   patch:
 *     summary: Submit (or un-submit) the company profile for admin review (owner only)
 *     description: |
 *       Phase 19. Toggles the `isCompleted` field on the company.
 *       Setting it to `true` is the owner's "I'm done editing, please
 *       review" signal — the company then shows up in the admin
 *       approval queue and the admin can approve it. Setting it to
 *       `false` pulls the company back out of the admin queue (only
 *       allowed when the company is not yet approved).
 *
 *       Once `approvedByAdmin=true` the field is frozen — the
 *       endpoint refuses with 400 from that point on.
 *     tags: [Company]
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
 *             required: [isCompleted]
 *             properties:
 *               isCompleted:
 *                 type: boolean
 *                 description: true to submit, false to un-submit
 *     responses:
 *       200:
 *         description: Profile completion status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     company:
 *                       $ref: '#/components/schemas/Company'
 *       400:
 *         description: Invalid body / company already approved
 *       404:
 *         description: Company not found / not owned by this user
 */
router.patch(
    companyRoutes.completeProfile,
    auth(),
    validation(CompanyValidation.completeProfileSchema),
    companyService.submitProfileForReview
)

/**
 * @swagger
 * /company/{companyId}/ratings:
 *   get:
 *     summary: Aggregated ratings for a company's public profile
 *     description: |
 *       Public, no-auth-required endpoint that powers the star
 *       section + rating histogram + "latest reviews" block on
 *       the student-facing company page and the company's own
 *       profile.
 *
 *       Sourced from STUDENT→COMPANY ratings whose backing
 *       application is `accepted` AND `completed`. Cancelled or
 *       pending applications are intentionally excluded.
 *
 *       Cached for 60 s under `company:ratings:{companyId}`;
 *       `application.service.rate` busts the key on submit.
 *
 *       Returns `404` if the company is missing, banned, pending
 *       admin approval, or soft-deleted.
 *     tags: [Company]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Aggregated ratings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     avg:
 *                       type: number
 *                       description: Mean of all completed-application ratings, rounded to 1 decimal. `0` when empty.
 *                       example: 4.6
 *                     count:
 *                       type: integer
 *                       description: Number of completed-application ratings counted.
 *                       example: 37
 *                     histogram:
 *                       type: array
 *                       description: Star distribution as percentages, 5→1. Always sums to exactly 100 (or all zeros when empty).
 *                       items:
 *                         type: object
 *                         properties:
 *                           stars:
 *                             type: integer
 *                             enum: [1, 2, 3, 4, 5]
 *                           pct:
 *                             type: integer
 *                             minimum: 0
 *                             maximum: 100
 *                       example:
 *                         - { stars: 5, pct: 72 }
 *                         - { stars: 4, pct: 19 }
 *                         - { stars: 3, pct: 6 }
 *                         - { stars: 2, pct: 2 }
 *                         - { stars: 1, pct: 1 }
 *                     reviews:
 *                       type: array
 *                       description: Up to 5 latest reviews with non-empty `comment`. Newest first.
 *                       items:
 *                         type: object
 *                         properties:
 *                           student:
 *                             type: string
 *                             description: 'Privacy-preserving display name: "Sara M." (first name + first letter of last name). Falls back to "Anonymous" if the rater doc is missing.'
 *                             example: Sara M.
 *                           track:
 *                             type: string
 *                             description: First track on the internship that was rated. Empty string when the internship has no track or has been deleted.
 *                             example: backend
 *                           rating:
 *                             type: integer
 *                             minimum: 1
 *                             maximum: 5
 *                           date:
 *                             type: string
 *                             format: date-time
 *                           body:
 *                             type: string
 *                             maxLength: 1000
 *                 msg:
 *                   type: string
 *       400:
 *         description: Invalid company id
 *       404:
 *         description: Company not found (also when banned, soft-deleted, or pending admin approval)
 */
router.get(
    companyRoutes.getCompanyRatings,
    companyService.getCompanyRatings
)
/**
 * @swagger
 * /company/name/{name}:
 *   get:
 *     summary: Get company by name
 *     tags: [Company]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Company fetched successfully
 *       404:
 *         description: Company not found
 */
router.get(
    companyRoutes.getCompanyByName,
    companyService.getCompanyByName
)

/**
 * @swagger
 * /company/{companyId}/logo:
 *   post:
 *     summary: Upload company logo
 *     tags: [Company]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Media uploaded successfully
 *       400:
 *         description: Invalid company id
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Company not found
 */
router.post(
    companyRoutes.uploadLogo,
    auth(),
    (req, res, next) => { req.params.type = 'logo'; next(); },
    uploadFile({ fileType: fileTypes.images, storeIn: StoreIn.DISK }).single('file'),
    companyService.uploadMedia
)
/**
 * @swagger
 * /company/{companyId}/coverPicture:
 *   post:
 *     summary: Upload company cover picture
 *     tags: [Company]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Media uploaded successfully
 *       400:
 *         description: Invalid company id
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Company not found
 */
router.post(
    companyRoutes.uploadCover,
    auth(),
    (req, res, next) => { req.params.type = 'coverPicture'; next(); },
    uploadFile({ fileType: fileTypes.images, storeIn: StoreIn.DISK }).single('file'),
    companyService.uploadMedia
)

/**
 * @swagger
 * /company/admin/pending:
 *   get:
 *     summary: List companies pending admin approval
 *     tags: [Company]
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
 *     responses:
 *       200:
 *         description: Pending companies fetched successfully
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
 *                       items:
 *                         type: object
 *                         allOf:
 *                           - $ref: '#/components/schemas/Company'
 *                           - type: object
 *                             properties:
 *                               legalAttachment:
 *                                 type: object
 *                                 description: Cloudinary reference of the legal attachment used to verify the company.
 *                                 properties:
 *                                   public_id:
 *                                     type: string
 *                                   secure_url:
 *                                     type: string
 *                               legalAttachmentUrl:
 *                                 type: string
 *                                 description: Authenticated file-proxy URL; fetch it with the bearer token to open the PDF inline in the browser (same mechanism as the CV/resume).
 *                                 example: /api/v1/file-proxy/legal-attachment.pdf?url=<encoded cloudinary url>
 *       403:
 *         description: Admin role required
 */
router.get(
    companyRoutes.adminPending,
    auth(),
    AuthZMiddleware([UserRoleEnum.ADMIN]),
    validation(CompanyValidation.listPendingCompaniesQuerySchema),
    companyService.listPending
)

/**
 * @swagger
 * /company/admin/{companyId}/ban:
 *   patch:
 *     summary: Ban a company (admin only)
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Company banned successfully
 *       400:
 *         description: Company is already banned
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Company not found
 */
router.patch(
    companyRoutes.adminBan,
    auth(),
    AuthZMiddleware([UserRoleEnum.ADMIN]),
    companyService.banCompany
)

/**
 * @swagger
 * /company/admin/{companyId}/unban:
 *   patch:
 *     summary: Unban a company (admin only)
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Company unbanned successfully
 *       400:
 *         description: Company is not banned
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Company not found
 */
router.patch(
    companyRoutes.adminUnban,
    auth(),
    AuthZMiddleware([UserRoleEnum.ADMIN]),
    companyService.unbanCompany
)
/**
 * @swagger
 * /company/admin/{companyId}/approve:
 *   patch:
 *     summary: Approve a company (admin only)
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Company approved successfully
 *       400:
 *         description: Invalid company id / Company is already approved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Company not found
 */
router.patch(
    companyRoutes.adminApprove,
    auth(),
    AuthZMiddleware([UserRoleEnum.ADMIN]),
    companyService.approveCompanyAdmin
)

export default router