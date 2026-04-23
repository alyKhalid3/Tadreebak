
import { z } from "zod";

export const signupSchema = z.object({
    firstName: z.string().min(3).max(20),
    lastName: z.string().min(3).max(20),
    email: z.email(),
    password: z.string().min(8).max(20),
    confirmPassword: z.string(),
    phone: z.string()
}).refine(args => args.password === args.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwords do not match'
})

export const confirmEmailSchema = z.object({
    otp: z.string().length(6),
    email: z.email()
})

export const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(8).max(20)
})

export const resendEmailOtpSchema = z.object({
    email: z.email()
})
export const resetPasswordSchema = z.object({
    email: z.email(),
    otp: z.string().length(6),
    password: z.string().min(8).max(20),
    confirmPassword: z.string().min(8).max(20)
}).refine(args => args.password === args.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwords do not match'
})