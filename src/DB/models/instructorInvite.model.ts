// Phase 18 / InstructorInvite collection.
//
// Audit log of every "invite an instructor" event. The active state
// of an instructor lives on `User.companyAffiliation` — this collection
// is the history (pending → accepted / revoked / expired).
//
// Why a partial-unique-on-pending and not a hard unique index?
// A revoked invite should be replayable: the admin might re-invite
// the same email next week. So we only enforce uniqueness while the
// invite is still PENDING — once it's accepted or revoked, it stops
// gating duplicates.
//
// Note: MongoDB partial-unique syntax is `{ unique: true, partialFilterExpression: ... }`.
// We use `status: 'pending'` as the filter so duplicates among the
// same email at the same company are only rejected while one is still
// open.

import mongoose from "mongoose"
import {
    IInstructorInvite,
    InstructorInviteStatus,
} from "../types/instructorInvite.type"

const instructorInviteSchema = new mongoose.Schema<IInstructorInvite>(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            index: true,
        },
        instructorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        roleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CompanyRole',
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(InstructorInviteStatus),
            required: true,
            default: InstructorInviteStatus.PENDING,
        },
        note: { type: String, trim: true, maxlength: 500 },
        // Phase 18B / two-step accept flow (docs/EMAIL_INVITE_SECURITY.md).
        // The first email carries the confirm token; the second
        // carries the setup token. Both are SHA-256 hashed on the
        // row (`select: false`) — the matching endpoint opts in
        // explicitly and compares timing-safe.
        confirmTokenHash: { type: String, default: null, select: false },
        setupTokenHash: { type: String, default: null, select: false },
        expiresAt: { type: Date, default: null },
        confirmedAt: { type: Date, default: null },
        acceptedAt: { type: Date, default: null },
        revokedAt: { type: Date, default: null },
        revokedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    { timestamps: true },
)

// One PENDING invite per (company, email) — once it's accepted or revoked
// the gate opens for a fresh invite to the same address. We use a
// partial-unique index so the constraint only fires on the open row.
instructorInviteSchema.index(
    { companyId: 1, email: 1 },
    {
        unique: true,
        partialFilterExpression: { status: InstructorInviteStatus.PENDING },
    },
)

// Compound for the "list this company's invites" admin page.
instructorInviteSchema.index({ companyId: 1, createdAt: -1 })

export const InstructorInviteModel = mongoose.model<IInstructorInvite>(
    'InstructorInvite',
    instructorInviteSchema,
)