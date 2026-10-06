
import mongoose, { HydratedDocument, Schema } from "mongoose";
import { IUser, ProviderEnum, UserRoleEnum, type fileAttributtes, IEducation, IExperience, IEnrollment } from "../types/user.type";
import { template } from "../../utils/sendEmail/generateHtml";
import { emailEmitter } from "../../utils/sendEmail/emailEvents";
import { createHash } from "../../utils/hash";


const userSchema = new mongoose.Schema<IUser>({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, enum: UserRoleEnum, default: UserRoleEnum.STUDENT },
    newEmail: { type: String, unique: true, sparse: true },
    emailOtp: {
        otp: { type: String },
        expiresAt: { type: Date },
        attempts: { type: Number, default: 0 },
    },
    passwordOtp: {
        otp: { type: String },
        expiresAt: { type: Date },
        attempts: { type: Number, default: 0 },
    },
    newEmailOtp: {
        otp: { type: String },
        expiresAt: { type: Date },
        attempts: { type: Number, default: 0 },
    },
    // sparse so Google/OAuth users (no phone) don't collide on a null value
    phoneNumber: { type: String, unique: true, sparse: true },
    isConfirmed: { type: Boolean, default: false },
    isChangeCredentialsUpdated: { type: Date },
    profilePicture: {
        type: {
            public_id: String,
            secure_url: String
        }, default: { public_id: '', secure_url: '' }
    },
    coverPicture: {
        type: { public_id: String, secure_url: String }, default: { public_id: '', secure_url: '' }
    },
    provider: { type: String, enum: ProviderEnum, default: ProviderEnum.SYSTEM },
    bio: { type: String, maxlength: 500 },
    headline: { type: String, maxlength: 100 },
    // Phase 17 / P5 #12 — daily streak check-in (student gamification).
    // Defaults to 0 / null so legacy users stay valid without a
    // migration; service handles the "first check-in" case.
    streakCount: { type: Number, default: 0, min: 0 },
    lastCheckInAt: { type: Date, default: null },
    // Skills are Mixed so each array element can be either a plain
    // string ("React") or an object with source/sourceRef/description.
    // Validation is enforced at the API boundary (user.validation),
    // not in the Mongoose schema — Mongoose Mixed skips per-element
    // cast. See user.validation.ts → skillSchema for the wire shape.
    skills: [{ type: Schema.Types.Mixed }],
    categories: [{ type: String }],
    courses: [{
        name: { type: String, required: true },
        certificate: {
            public_id: { type: String },
            secure_url: { type: String },
            resourceType: { type: String, enum: ['image', 'raw'] },
        },
        startDate: { type: Date },
        endDate: { type: Date, default: null },
        present: { type: Boolean, default: false },
        description: { type: String, maxlength: 1000 },
    }],
    education: [{
        institution: { type: String, required: true },
        degree: { type: String, required: true },
        field: { type: String, required: true },
        grade: { type: String, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date },
        description: { type: String, maxlength: 1000 },
    }],
    // Public social links (LinkedIn / GitHub / portfolio / etc).
    socials: [{
        platform: { type: String, required: true, maxlength: 50 },
        url: { type: String, required: true },
    }],
    experience: [{
        company: { type: String, required: true },
        title: { type: String, required: true },
        description: { type: String },
        startDate: { type: Date, required: true },
        endDate: { type: Date }
    }],
    resume: {
        type: { public_id: String, secure_url: String }, default: { public_id: '', secure_url: '' }
    },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female'] },
    address: { type: String },
    ratingCount: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },

    // ---- Intern enrollment (multi-company, Phase 5 redesign) ----
    // The canonical model. One user can be enrolled at many companies.
    enrollments: [{
        _id: { type: Schema.Types.ObjectId, auto: true },
        companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
        status: {
            type: String,
            enum: ['active', 'completed', 'withdrawn'],
            default: 'active',
        },
        enrolledAt: { type: Date, required: true },
        internshipStartDate: { type: Date, required: true },
        internshipEndDate: { type: Date, default: null },
        totalPoints: { type: Number, default: 0 },
    }],
    // Legacy single-company fields. Kept readable for the migration
    // window. New code writes only to enrollments[].
    enrolledAt: { type: Date },
    enrollmentCompanyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    totalPoints: { type: Number, default: 0 },
    internshipStartDate: { type: Date },
    internshipEndDate: { type: Date, default: null },

    // ---- Phase 18B / Company staff ----
    // See IUser docs for the full design. The array shape means
    // a User can be staff at multiple companies with different
    // roles per company. For v1 we enforce "one company at a
    // time" at the service layer (a re-invite of an already-
    // active staff member is rejected).
    staffMembership: [{
        _id: { type: Schema.Types.ObjectId, auto: true },
        companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
        roleId: { type: Schema.Types.ObjectId, ref: 'CompanyRole', required: true },
        status: { type: String, enum: ['active', 'removed'], default: 'active' },
        joinedAt: { type: Date, required: true, default: () => new Date() },
        removedAt: { type: Date, default: null },
    }],
}, { timestamps: true });

// Indexes for intern-dashboard queries. The list interns endpoint
// filters by `enrollments.companyId`; the leaderboard sorts by per-
// enrollment points — both are common.
userSchema.index({ 'enrollments.companyId': 1, 'enrollments.status': 1 })
userSchema.index({ 'enrollments.totalPoints': -1 })
// Legacy indexes (kept for the migration window)
userSchema.index({ enrollmentCompanyId: 1, role: 1 })
// Phase 18B / Staff lookup: list "active staff at this company".
// The compound indexes rows where the user has a staff membership;
// without a `staffMembership` element, the row is not indexed here.
userSchema.index(
    { 'staffMembership.companyId': 1, 'staffMembership.status': 1 },
    { sparse: true },
)

userSchema.pre('save', async function (this: HydratedDocument<IUser> & { firstCreation: boolean, plainTextOtp?: string }) {
    this.firstCreation = this.isNew
    this.plainTextOtp = this.emailOtp?.otp as string
    if (this.isModified('password'))
        this.password = await createHash({ text: this.password as string })
    if (this.isModified('emailOtp'))
        this.emailOtp.otp = await createHash({ text: this.emailOtp.otp })
})
userSchema.post('save', function (doc, next) {

    const that = this as HydratedDocument<IUser> & { firstCreation: boolean, plainTextOtp?: string }
    if (that.firstCreation && doc.provider === ProviderEnum.SYSTEM) {
        const subject = 'email verification'
        const html = template({ code: that.plainTextOtp as string, name: `${doc.firstName} ${doc.lastName}`, subject })
        emailEmitter.publish('send-email-activation-code', { to: doc.email, subject, html })
    }
    next()

})

export const UserModel = mongoose.model<IUser>('User', userSchema);