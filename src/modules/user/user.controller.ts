import { UserService } from './user.service';
import { Router } from "express";
import { auth } from "../../middleware/authentication.middelware";
import { fileTypes, StoreIn, uploadFile } from '../../utils/multer/multer';
import { AuthZMiddleware } from '../../middleware/authorization.middelware';
import { UserRoleEnum } from '../../DB/types/user.type';

const router = Router();


export const userRoutes = {
    base: '/user',
    uploadMedia: '/upload/:type',
    update: '/:userId',
    delete: '/:userId',
    approveCompany: '/approve-company/:companyId',
}
const userService = new UserService()
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


router.patch(userRoutes.approveCompany, auth(),AuthZMiddleware([UserRoleEnum.ADMIN]), userService.approveCompany)




export default router