// Program = a cohort / batch of interns at a company. Distinct from an
// Internship (which is a single job posting). One Program can span
// multiple Internships; interns are enrolled at the Program level.

import { Types } from "mongoose"

export enum ProgramStatus {
    UPCOMING = 'upcoming',
    ACTIVE = 'active',
    COMPLETED = 'completed',
    ARCHIVED = 'archived',
}

export interface IProgram {
    _id?: Types.ObjectId
    name: string
    description?: string
    companyId: Types.ObjectId
    status: ProgramStatus
    startDate: Date
    endDate?: Date | null
    // Active interns in this program. Interns are referenced by their User
    // id — joining happens via the existing enrollment fields on User
    // (enrolledAt, enrollmentCompanyId). We keep an explicit list here
    // for fast dashboard reads without an extra $lookup.
    internIds: Types.ObjectId[]
    // Display metadata for the dashboard
    coverImage?: { public_id: string; secure_url: string }
    maxInterns?: number
    createdAt?: Date
    updatedAt?: Date
}
