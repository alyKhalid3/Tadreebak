// Project = a piece of work inside a program. The kanban groups tasks
// by project; the intern profile shows project progress. One program
// can have many projects; one project can have many interns.

import { Types } from "mongoose"
import { IAttachment } from "./attachment.type"

export enum ProjectStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    ARCHIVED = 'archived',
}

export interface IProject {
    _id?: Types.ObjectId
    name: string
    description?: string
    companyId: Types.ObjectId
    programId?: Types.ObjectId
    internIds: Types.ObjectId[]
    status: ProjectStatus
    startDate?: Date
    endDate?: Date | null
    // Display metadata
    color?: string  // for the dashboard chip (hex)
    // Optional attachment — typically a brief, spec, or mockup that
    // explains the project to the interns assigned to it. Set on
    // create via multipart upload; the service uploads to
    // Cloudinary and stamps the public_id + secure_url here.
    attachment?: IAttachment
    createdAt?: Date
    updatedAt?: Date
}
