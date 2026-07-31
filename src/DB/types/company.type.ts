import { Types } from "mongoose"
import { fileAttributtes } from "./user.type"







export interface ILocation {
    lat: number
    lng: number
}

export interface ICompany {
    name: string
    description: string
    industry: string
    address: string
    location?: ILocation
    numberOfEmployees: string
    companyEmail: string
    createdBy: Types.ObjectId
    logo: fileAttributtes
    coverPicture: fileAttributtes
    // HRs: Types.ObjectId[]
    bannedAt: Date
    deletedAt: Date
    legalAttachment:fileAttributtes
    approvedByAdmin: boolean
    internshipCredits: number
    avgRating?: number | null
    ratingCount: number
    googleMapsUrl?: string
}