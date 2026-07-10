import mongoose from "mongoose";
import { IApplication, ApplicationStatus } from "../types/application.type";
import { QuestionType } from "../types/question.type";



const answerSchema = new mongoose.Schema({
    type: { type: String, enum: Object.values(QuestionType), required: true },
    prompt: { type: String, required: true },
    options: { type: [String], default: [] },
    selectedOption: { type: String },
    text: { type: String },
}, { _id: false });

export const applicationSchema = new mongoose.Schema<IApplication>({
    internshipId: { type: mongoose.Schema.Types.ObjectId, ref: 'InternShip', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ApplicationStatus, default: ApplicationStatus.PENDING, required: true },
    coverLetter: { type: String },
    resume: {
        type: {
            public_id: String,
            secure_url: String
        }, default: { public_id: '', secure_url: '' }
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    answers: { type: [answerSchema], default: [] },
    completed: { type: Boolean, default: false },
}, { timestamps: true });

// A student may only ever submit one application to a given internship — even
// after a rejection. This compound unique index enforces that at the DB layer.
applicationSchema.index({ internshipId: 1, studentId: 1 }, { unique: true });

export const ApplicationModel = mongoose.model<IApplication>('Application', applicationSchema);
