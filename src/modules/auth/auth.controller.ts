
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
const authService=new AuthService()


router.post(authRoutes.signup,validation(AuthValidation.signupSchema),authService.signup)
router.patch(authRoutes.confirmEmail,validation(AuthValidation.confirmEmailSchema),authService.confirmEmail)
router.patch(authRoutes.resendEmailOtp,validation(AuthValidation.resendEmailOtpSchema),authService.resendEmailOtp)
router.post(authRoutes.login,validation(AuthValidation.loginSchema),authService.login)
router.patch(authRoutes.forgotPassword,validation(AuthValidation.resendEmailOtpSchema),authService.forgotPassword)
router.patch(authRoutes.resetPassword,validation(AuthValidation.resetPasswordSchema),authService.resetPassword)

export default router