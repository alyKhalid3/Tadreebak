import mongoose from "mongoose"
import { ISavedCompany } from "../types/savedCompany.type"

const savedCompanySchema = new mongoose.Schema<ISavedCompany>(
    {
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Company',
        },
    },
    { timestamps: true },
)

// A student can save a given company at most once. Also powers
// the list-by-student path and the cascade-cleanup-on-company-delete
// path that we'll wire when company soft-delete lands.
savedCompanySchema.index({ studentId: 1, companyId: 1 }, { unique: true })
// List path: "all companies a student saved, newest first".
savedCompanySchema.index({ studentId: 1, createdAt: -1 })

export const SavedCompanyModel = mongoose.model<ISavedCompany>(
    'SavedCompany',
    savedCompanySchema,
)
