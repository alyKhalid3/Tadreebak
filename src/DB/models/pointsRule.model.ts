import mongoose from "mongoose"
import {
    IPointsRule,
    IPointsMilestone,
    PointsCategoryEnum,
    PointsFrequencyEnum,
    PointsStatusEnum,
} from "../types/pointsRule.type"

const pointsRuleSchema = new mongoose.Schema<IPointsRule>(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            index: true,
        },
        title: { type: String, required: true, trim: true, maxlength: 120 },
        category: {
            type: String,
            enum: Object.values(PointsCategoryEnum),
            required: true,
        },
        points: { type: Number, required: true, min: 0, max: 10_000 },
        frequency: {
            type: String,
            enum: Object.values(PointsFrequencyEnum),
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(PointsStatusEnum),
            required: true,
            default: PointsStatusEnum.ACTIVE,
        },
        description: { type: String, trim: true, maxlength: 1000 },
    },
    { timestamps: true },
)

// The stats endpoint filters by `{ companyId, status: 'active' }`
// — the compound index covers that exact predicate. List endpoint
// sorts by createdAt desc, so the timestamp is in the secondary
// position so MySQL-style index-only scans can satisfy the sort.
pointsRuleSchema.index({ companyId: 1, status: 1, createdAt: -1 })
pointsRuleSchema.index({ companyId: 1, category: 1 })

export const PointsRuleModel = mongoose.model<IPointsRule>('PointsRule', pointsRuleSchema)


const pointsMilestoneSchema = new mongoose.Schema<IPointsMilestone>(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            index: true,
        },
        title: { type: String, required: true, trim: true, maxlength: 120 },
        threshold: { type: Number, required: true, min: 0, max: 1_000_000 },
        reward: { type: String, required: true, trim: true, maxlength: 200 },
    },
    { timestamps: true },
)

// Sorted by threshold ascending on the list endpoint (so the
// milestones appear in the order interns will hit them).
pointsMilestoneSchema.index({ companyId: 1, threshold: 1 })

export const PointsMilestoneModel = mongoose.model<IPointsMilestone>(
    'PointsMilestone',
    pointsMilestoneSchema,
)
