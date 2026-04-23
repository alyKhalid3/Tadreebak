import { UserRepo } from './../../DB/repos/user.repo';
import { NextFunction, Request, Response } from "express";
import { confirmEmailDTO, signupDTO } from './auth.DTO';
import { ApplicationError, BadRequestException, EmailIsExistException, ExpiredOTPException, NotFoundException } from '../../utils/error';
import { createOtp } from '../../utils/sendEmail/createOtp';
import { successHandler } from '../../utils/successHandler';
import { compareHash, createHash } from '../../utils/hash';
import { ProviderEnum } from '../../DB/types/user.type';
import { createJwt } from '../../utils/jwt';
import { template } from '../../utils/sendEmail/generateHtml';
import { emailEmitter } from '../../utils/sendEmail/emailEvents';

export const generateLoginTokens = (userId: string) => {
    const accessToken = createJwt({ id: userId }, process.env.ACCESS_TOKEN_SECRET as string, { expiresIn: '1H' })
    const refreshToken = createJwt({ id: userId }, process.env.REFRESH_TOKEN_SECRET as string, { expiresIn: '7d' })
    return { accessToken, refreshToken }
}


export class AuthService {
    private userRepo: UserRepo = new UserRepo();
    constructor() { }
    signup = async (req: Request, res: Response, next: NextFunction) => {
        const { firstName, lastName, email, password, phone }: signupDTO = req.body
        const isEmailExist = await this.userRepo.findByEmail({ email: req.body.email })
        const isPhoneExist = await this.userRepo.findOne({ filter: { phone: phone } })
        if (isEmailExist) {
            throw new EmailIsExistException()
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
        return successHandler({ res, message: "User created successfully", data: { user } })

    }
    confirmEmail = async (req: Request, res: Response, next: NextFunction) => {
        const { email, otp }: confirmEmailDTO = req.body
        const user = await this.userRepo.findByEmail({ email })
        if (!user) {
            throw new NotFoundException("User not found")
        }
        if (user.isConfirmed) {
            throw new ApplicationError("Email is already confirmed", 400)
        }
        if (user.emailOtp.expiresAt.getTime() < Date.now()) {
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
    }
    login = async (req: Request, res: Response, next: NextFunction) => {
        const { email, password } = req.body
        const user = await this.userRepo.findByEmail({ email })
        if (!user || !await compareHash({ text: password, hashed: user.password }) || user.provider != ProviderEnum.SYSTEM) {
            throw new BadRequestException("Invalid Credentials")
        }
        if (!user.isConfirmed) {
            throw new ApplicationError("Please confirm your email to proceed", 400)
        }
        const tokens = generateLoginTokens(user._id.toString())
        return successHandler({ res, message: "Logged in successfully", data: { tokens } })
    }
    resendEmailOtp = async (req: Request, res: Response, next: NextFunction) => {
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
        const html = template({ code: otp, name: user.firstName, subject })
        emailEmitter.publish('send-email-activation-code', { to: user.email, subject, html })
        await this.userRepo.update({
            filter: { email },
            data: { emailOtp: { otp: await createHash({ text: otp }), expiresAt: new Date(Date.now() + 5 * 60 * 1000) } }
        })
        return successHandler({ res, message: "OTP resent successfully" })
    }
    forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
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
        const html = template({ code: otp, name: user.firstName, subject })
        emailEmitter.publish('send-email-password-reset-code', { to: user.email, subject, html })
        await this.userRepo.update({
            filter: { email },
            data: { passwordOtp: { otp: await createHash({ text: otp }), expiresAt: new Date(Date.now() + 5 * 60 * 1000) } }
        })
        return successHandler({ res, message: "Password reset OTP sent successfully" })
    }
    resetPassword = async (req: Request, res: Response, next: NextFunction) => {
        const { email, otp, password } = req.body
        const user = await this.userRepo.findByEmail({ email })
        if (!user) {
            throw new NotFoundException("User not found")
        }
        if (user.passwordOtp.expiresAt.getTime() < Date.now()) {
            throw new ExpiredOTPException("OTP has expired")
        }
        const isMatch = await compareHash({ text: otp, hashed: user.passwordOtp.otp })
        if (!isMatch) {
            throw new ApplicationError("Invalid OTP", 400)
        }
        await this.userRepo.update({
            filter: { email },
            data: { password: await createHash({ text: password }), passwordOtp: { otp: '', expiresAt: new Date() ,isChangeCredentialsUpdated: new Date()} }
        })
        return successHandler({ res, message: "Password Changed successfully" })
    }
}