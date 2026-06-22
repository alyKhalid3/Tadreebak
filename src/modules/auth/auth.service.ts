import { UserRepo } from './../../DB/repos/user.repo';
import { NextFunction, Request, Response } from "express";
import { confirmEmailDTO, signupDTO, changePasswordDTO, changeEmailDTO } from './auth.DTO';
import { ApplicationError, BadRequestException, EmailIsExistException, ExpiredOTPException, NotFoundException } from '../../utils/error';
import { createOtp } from '../../utils/sendEmail/createOtp';
import { successHandler } from '../../utils/successHandler';
import { compareHash, createHash } from '../../utils/hash';
import { ProviderEnum } from '../../DB/types/user.type';
import { createJwt, verifyJwt } from '../../utils/jwt';
import { template } from '../../utils/sendEmail/generateHtml';
import { emailEmitter } from '../../utils/sendEmail/emailEvents';
import { OAuth2Client } from 'google-auth-library';

export const generateLoginTokens = (userId: string) => {
    const accessToken = createJwt({ id: userId }, process.env.ACCESS_TOKEN_SECRET as string, { expiresIn: '1h' })
    const refreshToken = createJwt({ id: userId }, process.env.REFRESH_TOKEN_SECRET as string, { expiresIn: '7d' })
    return { accessToken, refreshToken }
}


export class AuthService {
    private userRepo: UserRepo = new UserRepo();
    signup = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { firstName, lastName, email, password, phone }: signupDTO = req.body
            const isEmailExist = await this.userRepo.findByEmail({ email: req.body.email })
            if (isEmailExist) {
                throw new EmailIsExistException()
            }
            const isPhoneExist = await this.userRepo.findOne({ filter: { phoneNumber: phone } })
            if (isPhoneExist) {
                throw new ApplicationError("Phone number already in use", 400)
            }
            const otp = createOtp();
            const user = await this.userRepo.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    password,
                    phoneNumber: phone,
                    emailOtp: {
                        otp,
                        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
                    }
                }
            })
            const safeUser = (({ _id, firstName, lastName, email, phoneNumber, role, isConfirmed, provider }) =>
                ({ _id, firstName, lastName, email, phoneNumber, role, isConfirmed, provider }))(user.toObject())
            return successHandler({ res, message: "User created successfully", data: { user: safeUser } })
        } catch (error) {
            next(error)
        }
    }
    confirmEmail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, otp }: confirmEmailDTO = req.body
            const user = await this.userRepo.findByEmail({ email })
            if (!user) {
                throw new NotFoundException("User not found")
            }
            if (user.isConfirmed) {
                throw new ApplicationError("Email is already confirmed", 400)
            }
            if (!user.emailOtp?.expiresAt || user.emailOtp.expiresAt.getTime() < Date.now()) {
                throw new ExpiredOTPException("OTP has expired")
            }
            const isMatch = await compareHash({ text: otp, hashed: user.emailOtp.otp })
            if (!isMatch) {
                throw new ApplicationError("Invalid OTP", 400)
            }

            await this.userRepo.update({
                filter: { email },
                data: { isConfirmed: true, emailOtp: { otp: '', expiresAt: new Date() } }
            })
            return successHandler({ res, message: "Email confirmed successfully" })
        } catch (error) {
            next(error)
        }
    }
    login = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, password } = req.body
            const user = await this.userRepo.findByEmail({ email })
            if (!user || !user.password || !await compareHash({ text: password, hashed: user.password }) || user.provider != ProviderEnum.SYSTEM) {
                throw new BadRequestException("Invalid Credentials")
            }
            if (!user.isConfirmed) {
                throw new ApplicationError("Please confirm your email to proceed", 400)
            }
            const tokens = generateLoginTokens(user._id.toString())
            return successHandler({ res, message: "Logged in successfully", data: { tokens } })
        } catch (error) {
            next(error)
        }
    }
    googleLogin = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { idToken } = req.body
            const clientId = process.env.GOOGLE_CLIENT_ID
            if (!clientId) {
                throw new ApplicationError('Google OAuth is not configured', 500)
            }
            const client = new OAuth2Client(clientId)
            const ticket = await client.verifyIdToken({ idToken, audience: clientId })
            const payload = ticket.getPayload()
            if (!payload || !payload.email) {
                throw new ApplicationError('Invalid Google token', 401)
            }
            const { email, given_name, family_name, picture } = payload

            let user = await this.userRepo.findByEmail({ email })
            if (user) {
                if (user.provider !== ProviderEnum.GOOGLE) {
                    throw new ApplicationError('Email already registered with a different provider', 409)
                }
            } else {
                user = await this.userRepo.create({
                    data: {
                        firstName: given_name || 'User',
                        lastName: family_name || '',
                        email,
                        isConfirmed: true,
                        provider: ProviderEnum.GOOGLE,
                        profilePicture: { public_id: '', secure_url: picture || '' },
                        coverPicture: { public_id: '', secure_url: '' }
                    }
                })
            }

            const tokens = generateLoginTokens(user._id.toString())
            return successHandler({ res, message: 'Logged in with Google successfully', data: { tokens } })
        } catch (error) {
            next(error)
        }
    }
    resendEmailOtp = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email } = req.body
            const user = await this.userRepo.findByEmail({ email })
            if (!user) {
                throw new NotFoundException("User not found")
            }
            if (user.isConfirmed) {
                throw new ApplicationError("Email is already confirmed", 400)
            }
            if (user.emailOtp.expiresAt.getTime() > Date.now()) {
                throw new ApplicationError("wait for 5 minutes", 400)
            }
            const subject = "Your OTP code"
            const otp = createOtp();
            await this.userRepo.update({
                filter: { email },
                data: { emailOtp: { otp: await createHash({ text: otp }), expiresAt: new Date(Date.now() + 5 * 60 * 1000) } }
            })
            const html = template({ code: otp, name: user.firstName, subject })
            emailEmitter.publish('send-email-activation-code', { to: user.email, subject, html })
            return successHandler({ res, message: "OTP resent successfully" })
        } catch (error) {
            next(error)
        }
    }
    forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email } = req.body
            const user = await this.userRepo.findByEmail({ email })
            if (!user) {
                throw new NotFoundException("User not found")
            }
            if (!user.isConfirmed) {
                throw new ApplicationError("Please confirm your email to proceed", 400)
            }
            if (user.passwordOtp.expiresAt?.getTime() > Date.now()) {
                throw new ApplicationError("wait for 5 minutes", 400)
            }
            const subject = "Your Password Reset OTP code"
            const otp = createOtp();
            await this.userRepo.update({
                filter: { email },
                data: { passwordOtp: { otp: await createHash({ text: otp }), expiresAt: new Date(Date.now() + 5 * 60 * 1000) } }
            })
            const html = template({ code: otp, name: user.firstName, subject })
            emailEmitter.publish('send-email-password-reset-code', { to: user.email, subject, html })
            return successHandler({ res, message: "Password reset OTP sent successfully" })
        } catch (error) {
            next(error)
        }
    }
    resetPassword = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, otp, password } = req.body
            const user = await this.userRepo.findByEmail({ email })
            if (!user) {
                throw new NotFoundException("User not found")
            }
            if (!user.passwordOtp?.expiresAt || user.passwordOtp.expiresAt.getTime() < Date.now()) {
                throw new ExpiredOTPException("OTP has expired")
            }
            const isMatch = await compareHash({ text: otp, hashed: user.passwordOtp.otp })
            if (!isMatch) {
                throw new ApplicationError("Invalid OTP", 400)
            }
            await this.userRepo.update({
                filter: { email },
                data: { password: await createHash({ text: password }), passwordOtp: { otp: '', expiresAt: new Date() }, isChangeCredentialsUpdated: new Date() }
            })
            return successHandler({ res, message: "Password Changed successfully" })
        } catch (error) {
            next(error)
        }
    }
    refreshToken = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { refreshToken } = req.body
            const payload = verifyJwt(refreshToken, process.env.REFRESH_TOKEN_SECRET as string)
            if (!payload.id) {
                throw new ApplicationError('Invalid refresh token', 401)
            }
            const user = await this.userRepo.findById({ id: payload.id })
            if (!user) {
                throw new NotFoundException('User not found')
            }
            if (user.isChangeCredentialsUpdated && payload.iat < Math.floor(user.isChangeCredentialsUpdated.getTime() / 1000)) {
                throw new ApplicationError('please login again', 400)
            }
            const tokens = generateLoginTokens(user._id.toString())
            return successHandler({ res, message: 'Tokens refreshed successfully', data: { tokens } })
        } catch (error) {
            next(error)
        }
    }
    logout = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            await this.userRepo.update({
                filter: { _id: user._id },
                data: { isChangeCredentialsUpdated: new Date() }
            })
            return successHandler({ res, message: 'Logged out successfully' })
        } catch (error) {
            next(error)
        }
    }
    changePassword = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { currentPassword, newPassword }: changePasswordDTO = req.body
            const user = res.locals.user
            if (!user.password) {
                throw new ApplicationError('Cannot change password for OAuth accounts', 400)
            }
            if (newPassword === currentPassword) {
                throw new ApplicationError('New password cannot be the same as current password', 400)
            }
            const isMatch = await compareHash({ text: currentPassword, hashed: user.password })
            if (!isMatch) {
                throw new ApplicationError('Current password is incorrect', 400)
            }
            await this.userRepo.update({
                filter: { _id: user._id },
                data: { password: await createHash({ text: newPassword }), isChangeCredentialsUpdated: new Date() }
            })
            return successHandler({ res, message: 'Password changed successfully' })
        } catch (error) {
            next(error)
        }
    }
    changeEmail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { newEmail }: changeEmailDTO = req.body
            const user = res.locals.user
            if (user.email === newEmail) {
                throw new ApplicationError('New email is the same as current email', 400)
            }
            const existingUser = await this.userRepo.findByEmail({ email: newEmail })
            if (existingUser) {
                throw new EmailIsExistException()
            }
            const otp = createOtp()
            await this.userRepo.update({
                filter: { _id: user._id },
                data: {
                    newEmail,
                    newEmailOtp: { otp: await createHash({ text: otp }), expiresAt: new Date(Date.now() + 5 * 60 * 1000) }
                }
            })
            const subject = 'Confirm Email Change'
            const html = template({ code: otp, name: user.firstName, subject })
            emailEmitter.publish('send-email-new-email-code', { to: user.email, subject, html })
            return successHandler({ res, message: 'OTP sent to your current email' })
        } catch (error) {
            next(error)
        }
    }
    confirmChangeEmail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { otp } = req.body
            const user = res.locals.user
            if (!user.newEmail) {
                throw new ApplicationError('No email change requested', 400)
            }
            if (!user.newEmailOtp?.expiresAt || user.newEmailOtp.expiresAt.getTime() < Date.now()) {
                throw new ExpiredOTPException('OTP has expired')
            }
            const isMatch = await compareHash({ text: otp, hashed: user.newEmailOtp.otp })
            if (!isMatch) {
                throw new ApplicationError('Invalid OTP', 400)
            }
            await this.userRepo.update({
                filter: { _id: user._id },
                data: {
                    email: user.newEmail,
                    newEmail: null,
                    newEmailOtp: { otp: '', expiresAt: new Date() },
                    isChangeCredentialsUpdated: new Date()
                }
            })
            return successHandler({ res, message: 'Email changed successfully' })
        } catch (error) {
            next(error)
        }
    }
}