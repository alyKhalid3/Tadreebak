
import { Router } from "express";
import { validation } from "../../middleware/validation.middleware";
import { CompanyService } from "./company.service";
import * as CompanyValidation from "./company.validation";
import { auth } from "../../middleware/authentication.middleware";
import { fileTypes, StoreIn, uploadFile } from "../../utils/multer/multer";
const router = Router();


export const companyRoutes = {
    base: '/company',
    list: '/',
    create: '/',
    getCompany: '/:companyId',
    updateCompany: '/:companyId',
    getCompanyByName: '/name/:name',
    uploadLogo: '/:companyId/logo',
    uploadCover: '/:companyId/coverPicture'

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
 *               numberOfEmployees:
 *                 type: string
 *               companyEmail:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Company updated successfully
 *       400:
 *         description: Invalid company id
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




export default router