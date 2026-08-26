import mongoose, { Types } from "mongoose";
import { ISavedInternship } from "../types/savedInternship.type";

const savedInternshipSchema = new mongoose.Schema<ISavedInternship>({
    studentId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    internshipId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'InternShip' },
}, { timestamps: true });

// A student can save a given internship at most once. Also powers fast
// lookups by student (the list endpoint) and by internship (cascade deletes).
savedInternshipSchema.index({ studentId: 1, internshipId: 1 }, { unique: true });

export const SavedInternshipModel = mongoose.model<ISavedInternship>('SavedInternship', savedInternshipSchema);
