
import { Router } from "express";
import { validation } from "../../middleware/validation.middelware";
import { CompanyService } from "./company.service";
import * as CompanyValidation from "./company.validation";
import { auth } from "../../middleware/auth.middelware";
import { fileTypes, StoreIn, uploadFile } from "../../utils/multer/multer";
import { ApplicationError } from "../../utils/error";
const router = Router();


export const companyRoutes = {
    base: '/company',
    create: '/',
    updateCompany: '/:companyId',
    getCompanyByName: '/:name',
    uploadMedia: '/:companyId/:type'
}
const companyService = new CompanyService()


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
router.patch(
    companyRoutes.updateCompany,
    auth(),
    validation(CompanyValidation.createCompany.partial()),
    companyService.updateCompany
)
/**
 * @swagger
 * /company/{name}:
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
 * /company/{companyId}/{type}:
 *   post:
 *     summary: Upload company media (logo or cover picture)
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [logo, coverPicture]
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
 *         description: type must be logo or coverPicture / invalid company id
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Company not found
 */
router.post(
    companyRoutes.uploadMedia,
    auth(),
    (req, res, next) => {
        if (req.params.type !== 'logo' && req.params.type !== 'coverPicture') {
            throw new ApplicationError('type must be logo or coverPicture', 400);
        }
        next();
    },
    uploadFile({ fileType: fileTypes.images, storeIn: StoreIn.DISK }).single('file'),
    companyService.uploadMedia
)




export default router