import mongoose, { Schema } from "mongoose"
import { IProject, ProjectStatus } from "../types/project.type"

const projectSchema = new mongoose.Schema<IProject>(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, maxlength: 2000 },
        companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
        programId: { type: Schema.Types.ObjectId, ref: "Program" },
        internIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
        status: {
            type: String,
            enum: ProjectStatus,
            default: ProjectStatus.ACTIVE,
            required: true,
        },
        startDate: { type: Date },
        endDate: { type: Date, default: null },
        color: { type: String, default: "#10b981" },
    },
    { timestamps: true },
)

// Hot-path queries:
//   - list a company's projects (often filtered by status)
//   - list a program's projects
projectSchema.index({ companyId: 1, status: 1, createdAt: -1 })
projectSchema.index({ programId: 1, status: 1 })

export const ProjectModel = mongoose.model<IProject>("Project", projectSchema)
