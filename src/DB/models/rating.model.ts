import mongoose from "mongoose";
import { IRating, RatingFrom, RatingTarget } from "../types/rating.type";

const ratingSchema = new mongoose.Schema<IRating>({
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
    from: { type: String, enum: Object.values(RatingFrom), required: true },
    raterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: Object.values(RatingTarget), required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000 },
}, { timestamps: true });

ratingSchema.index({ applicationId: 1, from: 1 }, { unique: true });
ratingSchema.index({ targetType: 1, targetId: 1 });

export const RatingModel = mongoose.model<IRating>('Rating', ratingSchema);
