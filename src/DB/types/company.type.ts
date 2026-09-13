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
    // `avgRating` is NOT persisted — see utils/avgRating.ts.
    ratingCount: number
    ratingSum?: number
    googleMapsUrl?: string
    // IANA timezone string (e.g. "Africa/Cairo"). Used by the
    // attendance module so "today" and the schedule's day-of-week
    // line up with the company's wall clock, not UTC. Defaults
    // to UTC when missing (legacy companies / not yet set).
    timezone?: string
}