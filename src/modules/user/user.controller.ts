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
    uploadProfilePicture: '/upload/profilePicture',
    uploadCoverPicture: '/upload/coverPicture',
    uploadResume: '/upload/resume',
    uploadCourseCertificate: '/upload/course-certificate/:courseIndex',
    addCourse: '/courses',
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
 *     description: |
 *       Requires a valid bearer token. The authenticated user can read any
 *       profile; this is not a self-only endpoint. The `experience` array
 *       is computed from completed internships — `rating`, `feedback` and
 *       `feedbackCreatedAt` are only populated after both parties submit
 *       a rating (or 14 days after completion).
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
 *       401:
 *         description: Missing or invalid bearer token
 *       404:
 *         description: User not found
 */
router.get(userRoutes.getProfile, auth(), userService.getProfile)
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
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Predefined categories or custom text entered after selecting Other.
 *                 maxItems: 4
 *               courses:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                   description: |
 *                     Student courses. To add a course together with its
 *                     certificate in one call, use POST /user/courses (multipart)
 *                     instead of PATCH. This PATCH endpoint can still be used to
 *                     add a course without a certificate.
 *                 maxItems: 20
 *               education:
 *                 type: array
 *                 items:
 *                   type: object
 *     description: The experience section is read-only and is derived from completed internships.
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       403:
 *         description: You can only update your own profile
 */
router.patch(userRoutes.update, auth(), validation(updateProfileSchema), userService.updateProfile)
/**
 * @swagger
 * /user/upload/profilePicture:
 *   post:
 *     summary: Upload user profile picture
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
 *         description: Image uploaded successfully
 *       400:
 *         description: File is required
 *       401:
 *         description: Unauthorized
 */
router.post(
    userRoutes.uploadProfilePicture,
    auth(),
    (req, res, next) => { req.params.type = 'profilePicture'; next(); },
    uploadFile({ fileType: fileTypes.images, storeIn: StoreIn.DISK }).single('file'),
    userService.uploadMedia
)

/**
 * @swagger
 * /user/upload/coverPicture:
 *   post:
 *     summary: Upload user cover picture
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
 *         description: Image uploaded successfully
 *       400:
 *         description: File is required
 *       401:
 *         description: Unauthorized
 */
router.post(
    userRoutes.uploadCoverPicture,
    auth(),
    (req, res, next) => { req.params.type = 'coverPicture'; next(); },
    uploadFile({ fileType: fileTypes.images, storeIn: StoreIn.DISK }).single('file'),
    userService.uploadMedia
)

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
 * /user/upload/course-certificate/{courseIndex}:
 *   post:
 *     summary: Upload a certificate for a student course
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseIndex
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
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
 *                 description: Certificate file. Images and PDFs are supported.
 *     responses:
 *       200:
 *         description: Course certificate uploaded successfully
 *       400:
 *         description: Invalid course index / file is required / unsupported file type
 *       404:
 *         description: User or course not found
 */
router.post(
    userRoutes.uploadCourseCertificate,
    auth(),
    uploadFile({ fileType: [...fileTypes.images, ...fileTypes.pdf], storeIn: StoreIn.DISK }).single('file'),
    userService.uploadCourseCertificate
)

/**
 * @swagger
 * /user/courses:
 *   post:
 *     summary: Add a course, optionally with a certificate, in one call
 *     description: |
 *       Unified endpoint to add a course to the authenticated user's profile.
 *       The `file` field is optional — if omitted, the course is created with
 *       no certificate and you can attach one later via
 *       `/user/upload/course-certificate/{courseIndex}`. If the certificate
 *       upload fails, the course is NOT created (atomic — no orphan course
 *       pointing at a missing file).
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Course name
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional certificate (image or PDF, max 2 MB).
 *     responses:
 *       201:
 *         description: Course added successfully (with or without certificate)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     course:
 *                       type: object
 *                       properties:
 *                         index: { type: integer, description: "Index of the new course in the user's `courses` array" }
 *                         name: { type: string }
 *                         certificate:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             public_id: { type: string }
 *                             secure_url: { type: string }
 *                             resourceType: { type: string, enum: [image, raw] }
 *                 msg: { type: string }
 *       400:
 *         description: Missing/invalid name or unsupported file type
 *       401:
 *         description: Missing or invalid bearer token
 *       409:
 *         description: Maximum 20 courses reached
 */
router.post(
    userRoutes.addCourse,
    auth(),
    uploadFile({ fileType: [...fileTypes.images, ...fileTypes.pdf], storeIn: StoreIn.DISK }).single('file'),
    userService.addCourse
)

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

// /**
//  * @swagger
//  * /user/approve-company/{companyId}:
//  *   patch:
//  *     summary: Approve a company (admin only)
//  *     tags: [User]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: companyId
//  *         required: true
//  *         schema:
//  *           type: string
//  *     responses:
//  *       200:
//  *         description: Company approved successfully
//  *       400:
//  *         description: Invalid company id / Company is already approved
//  *       401:
//  *         description: Unauthorized
//  *       403:
//  *         description: Admin role required
//  *       404:
//  *         description: Company not found
//  */
// router.patch(userRoutes.approveCompany, auth(), AuthZMiddleware([UserRoleEnum.ADMIN]), userService.approveCompany)

export default router
