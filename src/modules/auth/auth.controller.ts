
import { Router } from "express"
import { AuthService } from "./auth.service"
import { validation } from "../../middleware/validation.middleware"
import { auth } from "../../middleware/authentication.middleware"
import { authLimiter } from "../../middleware/rateLimiter"
import * as AuthValidation from "./auth.validation"


export const authRoutes = {
    base: '/auth',
    signup: '/signup',
    login: '/login',
    google: '/google',
    refresh: '/refresh',
    logout: '/logout',
    changePassword: '/change-password',
    changeEmail: '/change-email',
    confirmChangeEmail: '/confirm-change-email',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    confirmEmail: '/confirm-email',
    resendEmailOtp: '/resend-otp'
}
const router = Router()
// router.use(authLimiter)
const authService = new AuthService()


/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *               lastName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 20
 *               confirmPassword:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: User created successfully
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
 *                 msg:
 *                   type: string
 *       400:
 *         description: Email already exists or passwords do not match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(authRoutes.signup, validation(AuthValidation.signupSchema), authService.signup)
/**
 * @swagger
 * /auth/confirm-email:
 *   patch:
 *     summary: Confirm user email with OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *                 length: 6
 *     responses:
 *       200:
 *         description: Email confirmed successfully
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
 *         description: Email already confirmed or invalid OTP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       410:
 *         description: OTP has expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch(authRoutes.confirmEmail, validation(AuthValidation.confirmEmailSchema), authService.confirmEmail)
/**
 * @swagger
 * /auth/resend-otp:
 *   patch:
 *     summary: Resend email confirmation OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP resent successfully
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
 *         description: Email already confirmed or wait for 5 minutes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch(authRoutes.resendEmailOtp, validation(AuthValidation.resendEmailOtpSchema), authService.resendEmailOtp)
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post(authRoutes.login, validation(AuthValidation.loginSchema), authService.login)
/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Login or signup with Google
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Google login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokens:
 *                       $ref: '#/components/schemas/Tokens'
 *                 msg:
 *                   type: string
 *       401:
 *         description: Invalid Google token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Email already registered with a different provider
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(authRoutes.google, validation(AuthValidation.googleLoginSchema), authService.googleLogin)
/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokens:
 *                       $ref: '#/components/schemas/Tokens'
 *                 msg:
 *                   type: string
 *       401:
 *         description: Invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(authRoutes.refresh, validation(AuthValidation.refreshTokenSchema), authService.refreshToken)
/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user and invalidate all tokens
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.post(authRoutes.logout, auth(), authService.logout)
/**
 * @swagger
 * /auth/change-password:
 *   patch:
 *     summary: Change password while logged in
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 20
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 20
 *               confirmPassword:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 20
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *       400:
 *         description: Current password is incorrect or OAuth account
 */
router.patch(authRoutes.changePassword, auth(), validation(AuthValidation.changePasswordSchema), authService.changePassword)
/**
 * @swagger
 * /auth/change-email:
 *   post:
 *     summary: Request email change OTP
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newEmail:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP sent to new email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *       400:
 *         description: Email already exists or same as current
 */
router.post(authRoutes.changeEmail, auth(), validation(AuthValidation.changeEmailSchema), authService.changeEmail)
/**
 * @swagger
 * /auth/confirm-change-email:
 *   patch:
 *     summary: Confirm email change with OTP
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               otp:
 *                 type: string
 *                 length: 6
 *     responses:
 *       200:
 *         description: Email changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *       400:
 *         description: Invalid OTP or no change requested
 *       410:
 *         description: OTP has expired
 */
router.patch(authRoutes.confirmChangeEmail, auth(), validation(AuthValidation.confirmChangeEmailSchema), authService.confirmChangeEmail)
/**
 * @swagger
 * /auth/forgot-password:
 *   patch:
 *     summary: Request password reset OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset OTP sent successfully
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
 *         description: Please confirm your email first or wait for 5 minutes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch(authRoutes.forgotPassword, validation(AuthValidation.forgotPasswordSchema), authService.forgotPassword)
/**
 * @swagger
 * /auth/reset-password:
 *   patch:
 *     summary: Reset password using OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *                 length: 6
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 20
 *               confirmPassword:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 20
 *     responses:
 *       200:
 *         description: Password changed successfully
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
 *         description: Invalid OTP or passwords do not match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       410:
 *         description: OTP has expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch(authRoutes.resetPassword, validation(AuthValidation.resetPasswordSchema), authService.resetPassword)

export default router