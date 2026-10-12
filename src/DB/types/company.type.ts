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
    // Owner-set signal that the company profile is "done" and ready
    // for admin review. The owner flips it via
    //   PATCH /company/:companyId/complete-profile  { isCompleted: true }
    // after editing the enrichment fields (website / linkedin /
    // headline / foundedYear / timezone). The admin queue
    // (`GET /company/admin/pending`) only shows companies with
    // `isCompleted=true AND approvedByAdmin=false`, and the admin
    // `approve` endpoint refuses with 400 if the profile isn't
    // complete yet — see CompanyService.approveCompanyAdmin.
    isCompleted: boolean
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
    // Public profile enrichment fields (Phase 10 / P2 #D). All
    // optional so legacy companies stay readable without these
    // set. The wire shape matches BACKEND_GAPS_EN §D exactly.
    website?: string
    linkedin?: string
    headline?: string
    foundedYear?: number

    // Phase 18B / Company staff — denormalized mirror of the
    // staff list for fast "list my company's staff" queries.
    // `User.staffMembership[]` is the canonical source of truth;
    // a pre-save hook on User keeps this array in sync.
    // Soft-revoked staff are KEPT here so the audit trail survives.
    staffMembers?: Types.ObjectId[]
}