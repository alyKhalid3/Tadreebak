import { Types } from "mongoose"
import { fileAttributtes } from "./user.type"







export interface ICompany {
    name: string
    description: string
    industry: string
    address: string
    numberOfEmployees: string
    companyEmail: string
    createdBy: Types.ObjectId
    logo: fileAttributtes
    coverPicture: fileAttributtes
    HRs: Types.ObjectId[]
    bannedAt: Date
    deletedAt: Date
    legalAttachment:fileAttributtes
    approvedByAdmin: boolean
}