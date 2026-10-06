// Phase 18B / CompanyRole model.
//
// Per-company role definitions. A role carries a name +
// permission set; staff memberships reference a role by id.
//
// Indexes:
//   - (companyId, name) unique so a company can't have two
//     roles with the same name. Built-in roles (Owner /
//     Instructor) and custom roles share the same namespace —
//     the seed inserts them with reserved names so a custom
//     role can't collide.
import mongoose from "mongoose"
import { ICompanyRole } from "../types/companyRole.type"

const companyRoleSchema = new mongoose.Schema<ICompanyRole>(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 50,
        },
        description: { type: String, trim: true, maxlength: 500 },
        permissions: { type: [String], default: [] },
        isSystem: { type: Boolean, default: false },
        isOwnerRole: { type: Boolean, default: false },
    },
    { timestamps: true },
)

companyRoleSchema.index(
    { companyId: 1, name: 1 },
    { unique: true },
)

export const CompanyRoleModel = mongoose.model<ICompanyRole>(
    'CompanyRole',
    companyRoleSchema,
)