import mongoose from "mongoose"
import {
    IReport,
    ReportStatus,
    ReportTargetType,
} from "../types/report.type"

const reportSchema = new mongoose.Schema<IReport>(
    {
        reporterId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
            index: true,
        },
        targetType: {
            type: String,
            enum: Object.values(ReportTargetType),
            required: true,
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        reason: { type: String, required: true, maxlength: 1000 },
        status: {
            type: String,
            enum: Object.values(ReportStatus),
            required: true,
            default: ReportStatus.OPEN,
        },
    },
    { timestamps: true },
)

// Admin-side list path: "open reports, newest first" — the
// status filter is the hot one. Compound index covers the
// `{ status, createdAt: -1 }` query the admin queue will use.
reportSchema.index({ status: 1, createdAt: -1 })
// Per-target lookup (e.g. "all reports on company X").
reportSchema.index({ targetType: 1, targetId: 1 })

export const ReportModel = mongoose.model<IReport>('Report', reportSchema)
