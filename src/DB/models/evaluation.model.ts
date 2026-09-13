import mongoose, { Schema, Types } from "mongoose"
import { IEvaluation } from "../types/evaluation.type"

const periodSchema = new Schema(
    {
        start: { type: Date, required: true },
        end: { type: Date, required: true },
    },
    { _id: false },
)

const evaluationSchema = new mongoose.Schema<IEvaluation>(
    {
        internId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        companyId: {
            type: Schema.Types.ObjectId,
            ref: "Company",
            required: true,
            index: true,
        },
        evaluatorId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        period: { type: periodSchema, required: true },
        attendanceRate: { type: Number, required: true, min: 0, max: 100 },
        skillRating: { type: Number, required: true, min: 0, max: 5 },
        teamworkRating: { type: Number, required: true, min: 0, max: 5 },
        overallScore: { type: Number, required: true, min: 0, max: 100 },
        strengths: { type: String, maxlength: 2000 },
        improvements: { type: String, maxlength: 2000 },
        privateNotes: { type: String, maxlength: 5000 },
        evaluatedAt: { type: Date, required: true, default: () => new Date() },
        sharedWithIntern: { type: Boolean, default: false },
        sharedAt: { type: Date, default: null },
    },
    { timestamps: true },
)

// Hot paths:
//   - intern profile: latest evaluation per intern → { internId, evaluatedAt: -1 }
//   - admin list:    per-company evaluations → { companyId, evaluatedAt: -1 }
//   - alerts:        evaluation-overdue scan → { companyId, internId, evaluatedAt: -1 }
evaluationSchema.index({ internId: 1, evaluatedAt: -1 })
evaluationSchema.index({ companyId: 1, evaluatedAt: -1 })
evaluationSchema.index({ evaluatorId: 1, evaluatedAt: -1 })

export const EvaluationModel = mongoose.model<IEvaluation>(
    "Evaluation",
    evaluationSchema,
)
