import { Types } from "mongoose"

export interface ISavedCompany {
    studentId: Types.ObjectId
    companyId: Types.ObjectId
    createdAt?: Date
    updatedAt?: Date
}
