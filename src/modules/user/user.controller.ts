import { UserService } from './user.service';
import { Router } from "express";
import { auth } from "../../middleware/authentication.middleware";
import { fileTypes, StoreIn, uploadFile } from '../../utils/multer/multer';
import { AuthZMiddleware } from '../../middleware/authorization.middleware';
import { UserRoleEnum } from '../../DB/types/user.type';
import { validation } from '../../middleware/validation.middleware';
import { updateProfileSchema } from './user.validation';
import { ApplicationService } from '../applicationModule/application.service';
import * as ApplicationValidation from '../applicationModule/application.validation';

const router = Router();


export const userRoutes = {
    base: '/user',
    uploadMedia: '/upload/:type',
    uploadResume: '/upload/resume',
    myApplications: '/:userId/applications',
    getProfile: '/:userId',
    update: '/:userId',
    delete: '/:userId',
    approveCompany: '/approve-company/:companyId',
}
const userService = new UserService()
const applicationService = new ApplicationService()
/**
 * @swagger
 * /user/{userId}:
 *   get:
 *     summary: Get user profile by ID
 *     tags: [User]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get(userRoutes.getProfile, userService.getProfile)
/**
 * @swagger
 * /user/{userId}:
 *   patch:
 *     summary: Update user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               bio:
 *                 type: string
 *               headline:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date-time
 *               gender:
 *                 type: string
 *                 enum: [male, female]
 *               address:
 *                 type: string
 *               education:
 *                 type: array
 *                 items:
 *                   type: object
 *               experience:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       403:
 *         description: You can only update your own profile
 */
router.patch(userRoutes.update, auth(), validation(updateProfileSchema), userService.updateProfile)
/**
 * @swagger
 * /user/upload/{type}:
 *   post:
 *     summary: Upload user media (profile picture or cover picture)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [profilePicture, coverPicture]
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
 *         description: Image uploaded successfully
 *       400:
 *         description: File is required / invalid params type
 *       401:
 *         description: Unauthorized
 */
router.post(userRoutes.uploadMedia, auth(), uploadFile({ fileType: fileTypes.images, storeIn: StoreIn.DISK }).single('file'), userService.uploadMedia)

/**
 * @swagger
 * /user/upload/resume:
 *   post:
 *     summary: Upload or replace the user's resume (PDF)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
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
 *         description: Resume uploaded successfully
 *       400:
 *         description: Resume file is required
 *       401:
 *         description: Unauthorized
 */
router.post(userRoutes.uploadResume, auth(), uploadFile({ fileType: fileTypes.pdf, storeIn: StoreIn.DISK }).single('file'), userService.uploadResume)

/**
 * @swagger
 * /user/{userId}/applications:
 *   get:
 *     summary: List the authenticated user's own applications
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *         description: You can only view your own applications
 */
router.get(userRoutes.myApplications, auth(), validation(ApplicationValidation.listMyApplicationsQuerySchema), applicationService.listMine)

/**
 * @swagger
 * /user/{userId}:
 *   delete:
 *     summary: Delete user account
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: You can only delete your own account
 */
router.delete(userRoutes.delete, auth(), userService.deleteAccount)

router.patch(userRoutes.approveCompany, auth(), AuthZMiddleware([UserRoleEnum.ADMIN]), userService.approveCompany)




export default router