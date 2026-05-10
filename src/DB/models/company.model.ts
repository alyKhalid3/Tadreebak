import mongoose, { Types } from "mongoose";
import { ICompany } from "../types/company.type";






export const companySchema = new mongoose.Schema<ICompany>({
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    industry: { type: String, required: true },
    address: { type: String, required: true },
    numberOfEmployees: { type: String, required: true },
    companyEmail: { type: String, required: true, unique: true },
    createdBy: { type: Types.ObjectId, required: true, ref: 'User' },
    logo: {
        type: {
            public_id: String,
            secure_url: String
        }
    },
    coverPicture: {
        type: {
            public_id: String,
            secure_url: String
        }
    },
    // HRs: { type: [Types.ObjectId], default: [], ref: 'User' },
    bannedAt: { type: Date },
    deletedAt: { type: Date },
    legalAttachment: {
        type: {
            public_id: String,
            secure_url: String
        }, required: true
    },
    approvedByAdmin: { type: Boolean, default: false }
}, { timestamps: true });

export const companyModel = mongoose.model<ICompany>('Company', companySchema);
