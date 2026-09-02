import mongoose, { Schema, Types } from "mongoose";
import { IProgram, ProgramStatus } from "../types/program.type";

const programSchema = new mongoose.Schema<IProgram>(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, maxlength: 2000 },
        companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
        status: {
            type: String,
            enum: ProgramStatus,
            default: ProgramStatus.UPCOMING,
            required: true,
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date, default: null },
        internIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
        coverImage: {
            type: {
                public_id: { type: String },
                secure_url: { type: String },
            },
            default: undefined,
        },
        maxInterns: { type: Number, min: 1 },
    },
    { timestamps: true },
);

// Hot-path queries the dashboard runs:
//   - list a company's programs, sorted newest first
//   - filter by status (active vs upcoming vs completed)
//   - lookup by companyId+status
programSchema.index({ companyId: 1, status: 1, startDate: -1 })
programSchema.index({ companyId: 1, createdAt: -1 })

export const ProgramModel = mongoose.model<IProgram>("Program", programSchema)
