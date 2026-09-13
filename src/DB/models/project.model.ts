import mongoose, { Schema } from "mongoose"
import { IProject, ProjectStatus } from "../types/project.type"

// Same shape as the task attachment subdoc. One file per project
// (the "explanation") — kept as a single subdoc rather than an
// array because the use case is a single brief, not a media gallery.
const attachmentSchema = new Schema(
    {
        public_id: { type: String, required: true },
        secure_url: { type: String, required: true },
        name: { type: String, required: true, maxlength: 255 },
        mimeType: { type: String, required: true, maxlength: 127 },
        size: { type: Number, required: true, min: 0 },
    },
    { _id: false },
)

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
        attachment: { type: attachmentSchema, default: undefined },
    },
    { timestamps: true },
)

// Hot-path queries:
//   - list a company's projects (often filtered by status)
//   - list a program's projects
projectSchema.index({ companyId: 1, status: 1, createdAt: -1 })
projectSchema.index({ programId: 1, status: 1 })

export const ProjectModel = mongoose.model<IProject>("Project", projectSchema)
