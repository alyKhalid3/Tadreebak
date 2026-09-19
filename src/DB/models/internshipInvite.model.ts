import mongoose from "mongoose"
import {
    IInternshipInvite,
    InternshipInviteStatus,
} from "../types/internshipInvite.type"

const internshipInviteSchema = new mongoose.Schema<IInternshipInvite>(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            index: true,
        },
        internshipId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'InternShip',
            required: true,
            index: true,
        },
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(InternshipInviteStatus),
            required: true,
            default: InternshipInviteStatus.PENDING,
        },
        note: { type: String, trim: true, maxlength: 500 },
    },
    { timestamps: true },
)

// One invite per (internship, student) pair. Duplicate invites
// would silently bump the counter and create noise on the
// candidate profile; the unique index lets the create endpoint
// surface a clean 409 instead of a duplicate-key 500.
internshipInviteSchema.index(
    { internshipId: 1, studentId: 1 },
    { unique: true },
)

// List-per-internship query is the common path — compound index
// covers `{ internshipId, createdAt: -1 }`.
internshipInviteSchema.index({ internshipId: 1, createdAt: -1 })

export const InternshipInviteModel = mongoose.model<IInternshipInvite>(
    'InternshipInvite',
    internshipInviteSchema,
)
