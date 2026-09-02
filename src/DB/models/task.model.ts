import mongoose, { Schema, Types } from "mongoose"
import { ITask, TaskPriority, TaskStatus } from "../types/task.type"

const attachmentSchema = new Schema(
    {
        public_id: { type: String, required: true },
        secure_url: { type: String, required: true },
        name: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
    },
    { _id: false },
)

const taskSchema = new mongoose.Schema<ITask>(
    {
        title: { type: String, required: true, trim: true, maxlength: 200 },
        description: { type: String, required: true, maxlength: 5000 },
        companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
        internId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        projectId: { type: Schema.Types.ObjectId, ref: "Project" },
        programId: { type: Schema.Types.ObjectId, ref: "Program" },
        assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        status: {
            type: String,
            enum: TaskStatus,
            default: TaskStatus.TODO,
            required: true,
        },
        priority: {
            type: String,
            enum: TaskPriority,
            default: TaskPriority.MEDIUM,
            required: true,
        },
        tags: { type: [String], default: [] },
        dueDate: { type: Date, required: true },
        attachments: { type: [attachmentSchema], default: [] },
        submittedAt: { type: Date },
        reviewedAt: { type: Date },
        reviewerFeedback: { type: String, maxlength: 2000 },
        pointsAwarded: { type: Number, min: 0 },
        dueSoonNotifiedAt: { type: Date },
        overdueNotifiedAt: { type: Date },
    },
    { timestamps: true },
)

// Indexes target the hot paths:
//   - kanban: { companyId, status, dueDate } — list by status sorted by due date
//   - intern-side: { internId, status, dueDate } — intern's own kanban
//   - filter by project: { companyId, projectId }
//   - cron scans: due-soon (status !== complete, dueDate within 24h,
//     dueSoonNotifiedAt null) and overdue (status !== complete, dueDate < now,
//     overdueNotifiedAt null). The (status, dueDate) compound covers those.
taskSchema.index({ companyId: 1, status: 1, dueDate: 1 })
taskSchema.index({ companyId: 1, internId: 1, status: 1 })
taskSchema.index({ companyId: 1, projectId: 1 })
taskSchema.index({ internId: 1, status: 1, dueDate: 1 })
// Cron-friendly index for the "due in 24h" + "overdue" sweeps.
taskSchema.index({ status: 1, dueDate: 1, dueSoonNotifiedAt: 1 })
taskSchema.index({ status: 1, dueDate: 1, overdueNotifiedAt: 1 })

export const TaskModel = mongoose.model<ITask>("Task", taskSchema)
