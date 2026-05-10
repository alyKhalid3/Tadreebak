import { UserService } from './user.service';
import { Router } from "express";
import { auth } from "../../middleware/auth.middelware";
import { fileTypes, StoreIn, uploadFile } from '../../utils/multer/multer';

const router = Router();


export const userRoutes = {
    base: '/user',
    uploadMedia: '/upload/:type',
    update: '/:userId'
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




export default router