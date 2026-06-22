
import mongoose, { HydratedDocument, Schema } from "mongoose";
import { IUser, ProviderEnum, UserRoleEnum, type fileAttributtes, IEducation, IExperience } from "../types/user.type";
import { template } from "../../utils/sendEmail/generateHtml";
import { emailEmitter } from "../../utils/sendEmail/emailEvents";
import { createHash } from "../../utils/hash";


const userSchema = new mongoose.Schema<IUser>({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, enum: UserRoleEnum, default: UserRoleEnum.USER },
    newEmail: { type: String, unique: true, sparse: true },
    emailOtp: {
        otp: { type: String },
        expiresAt: { type: Date }
    },
    passwordOtp: {
        otp: { type: String },
        expiresAt: { type: Date }
    },
    newEmailOtp: {
        otp: { type: String },
        expiresAt: { type: Date }
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
    skills: [{ type: String }],
    education: [{
        institution: { type: String, required: true },
        degree: { type: String, required: true },
        field: { type: String, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date }
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
    address: { type: String }
}, { timestamps: true });

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