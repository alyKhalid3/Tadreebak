import { z } from "zod"

// Phase 19 / Signup intent. Frontend asks "I'm a student / I'm
// a company" at signup and sends the choice here. The backend
// stores it on `User.pendingRole` as a pure signal — `User.role`
// is still `STUDENT` at signup and only flips to `COMPANY_OWNER`
// when the user actually creates a company. See UserPendingRoleEnum.
const PENDING_ROLE_VALUES = ["student", "company"] as const

export const signupSchema = z.object({
    firstName: z.string().min(3).max(20),
    lastName: z.string().min(3).max(20),
    email: z.email(),
    password: z.string().min(8).max(20),
    confirmPassword: z.string().min(8).max(20),
    phone: z.string(),
    education: z.array(z.object({
        institution: z.string().min(1),
        degree: z.string().min(1),
        field: z.string().min(1),
        grade: z.string().min(1),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().optional(),
    })).optional(),
    // Phase 19 / Optional. Default "student" — no migration needed
    // for legacy signups that don't send the field.
    pendingRole: z.enum(PENDING_ROLE_VALUES, {
        message: "pendingRole must be 'student' or 'company'",
    }).optional().default("student"),
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

export const forgotPasswordSchema = z.object({
    email: z.email()
})

export const googleLoginSchema = z.object({
    idToken: z.string()
})

export const refreshTokenSchema = z.object({
    refreshToken: z.string()
})

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(8).max(20),
    newPassword: z.string().min(8).max(20),
    confirmPassword: z.string().min(8).max(20)
}).refine(args => args.newPassword === args.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwords do not match'
})

export const changeEmailSchema = z.object({
    newEmail: z.string().email()
})

export const confirmChangeEmailSchema = z.object({
    otp: z.string().length(6)
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
