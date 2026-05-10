
import mongoose, { HydratedDocument } from "mongoose";
import { IUser, ProviderEnum, UserRoleEnum, type fileAttributtes } from "../types/user.type";
import { template } from "../../utils/sendEmail/generateHtml";
import { emailEmitter } from "../../utils/sendEmail/emailEvents";
import { createHash } from "../../utils/hash";


const userSchema = new mongoose.Schema<IUser>({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
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
    phoneNumber: { type: String, unique: true },
    isConfirmed: { type: Boolean, default: false },
    isChangeCredentialsUpdated: { type: Date },
    profileImage: {
        type: {
            public_id: String,
            secure_url: String
        }, default: { public_id: '', secure_url: '' }
    },
    coverImage: {
        type: [{ public_id: String, secure_url: String }], default: []
    },
    provider: { type: String, enum: ProviderEnum, default: ProviderEnum.SYSTEM }
}, { timestamps: true });

userSchema.pre('save', async function (this: HydratedDocument<IUser> & { firstCreation: boolean, plainTextOtp?: string }, next) {
    this.firstCreation = this.isNew
    this.plainTextOtp = this.emailOtp?.otp as string
    if (this.isModified('password'))
        this.password = await createHash({ text: this.password })
    if (this.isModified('emailOtp'))
        this.emailOtp.otp = await createHash({ text: this.emailOtp.otp })




})
userSchema.post('save', function (doc, next) {

    const that = this as HydratedDocument<IUser> & { firstCreation: boolean, plainTextOtp?: string }
    if (that.firstCreation) {
        const subject = 'email verification'
        const html = template({ code: that.plainTextOtp as string, name: `${doc.firstName} ${doc.lastName}`, subject })
        emailEmitter.publish('send-email-activation-code', { to: doc.email, subject, html })
    }
    next()

})

export const UserModel = mongoose.model<IUser>('User', userSchema);