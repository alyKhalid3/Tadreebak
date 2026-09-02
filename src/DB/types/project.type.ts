// Project = a piece of work inside a program. The kanban groups tasks
// by project; the intern profile shows project progress. One program
// can have many projects; one project can have many interns.

import { Types } from "mongoose"

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
    createdAt?: Date
    updatedAt?: Date
}
