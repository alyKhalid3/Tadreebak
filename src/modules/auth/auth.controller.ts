
import { Router } from "express"
import { AuthService } from "./auth.service"
import { validation } from "../../middleware/validation.middelware"
import * as AuthValidation from "./auth.validation"


export const authRoutes = {
    base: '/auth',
    signup: '/signup',
    login: '/login',
    logout: '/logout',
    refresh: '/refresh',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    confirmEmail: '/confirm-email',
    resendEmailOtp: '/resend-otp'
}
const router = Router()
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
router.patch(authRoutes.forgotPassword, validation(AuthValidation.resendEmailOtpSchema), authService.forgotPassword)
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