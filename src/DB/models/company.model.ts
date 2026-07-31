import mongoose, { Types } from "mongoose";
import { ICompany } from "../types/company.type";

const locationSchema = new mongoose.Schema({
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
}, { _id: false });

export const companySchema = new mongoose.Schema<ICompany>({
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    industry: { type: String, required: true },
    address: { type: String, required: true },
    location: { type: locationSchema },
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
    approvedByAdmin: { type: Boolean, default: false },
    internshipCredits: { type: Number, default: 1, min: 0 },
    avgRating: { type: Number, default: null },
    ratingCount: { type: Number, default: 0 }
}, { timestamps: true });

// Link-out to Google Maps when coordinates exist. Present in every serialized
// response (JSON + object), so the frontend can embed/link without an API key.
companySchema.virtual('googleMapsUrl').get(function () {
    const { lat, lng } = this.location ?? {}
    if (typeof lat !== 'number' || typeof lng !== 'number') return undefined
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
})
companySchema.set('toJSON', { virtuals: true })
companySchema.set('toObject', { virtuals: true })

export const companyModel = mongoose.model<ICompany>('Company', companySchema);
