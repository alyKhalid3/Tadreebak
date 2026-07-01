import { NextFunction, Request, Response } from "express";
import mongoose, { isObjectIdOrHexString } from "mongoose";
import { ApplicationRepo } from "../../DB/repos/application.repo";
import { InternRepo } from "../../DB/repos/intern.repo";
import { UserRepo } from "../../DB/repos/user.repo";
import { ApplicationModel } from "../../DB/models/application.model";
import { ApplicationStatus, IApplication } from "../../DB/types/application.type";
import { IInternShip } from "../../DB/types/internship.type";
import { ApplicationError, NotFoundException } from "../../utils/error";
import { successHandler } from "../../utils/successHandler";
import { assertOwnedCompany } from "../../utils/companyAccess";
import { uploadSingleFile } from "../../utils/multer/cloudinary.service";

export class ApplicationService {
    private applicationRepo = new ApplicationRepo()
    private internRepo = new InternRepo()
    private userRepo = new UserRepo()

    // Fetch an active, public internship and confirm it belongs to the given
    // company. Throws if anything is off. Used by the apply flow.
    private async getInternshipForApply(internId: string, companyId: string): Promise<IInternShip> {
        if (!isObjectIdOrHexString(internId)) {
            throw new ApplicationError("Invalid internship id", 400)
        }
        const internship = await this.internRepo.findById({ id: internId })
        if (!internship) {
            throw new NotFoundException("Internship not found")
        }
        if (internship.companyId.toString() !== companyId) {
            throw new NotFoundException("Internship not found")
        }
        if (internship.closed) {
            throw new ApplicationError("This internship is no longer accepting applications", 400)
        }
        return internship
    }

    // Verify the company is owned by the user, then fetch the internship and
    // confirm it belongs to that company. Used by the company review endpoints.
    private async getOwnedInternship(internId: string, companyId: string, userId: string): Promise<void> {
        await assertOwnedCompany(companyId, userId)
        if (!isObjectIdOrHexString(internId)) {
            throw new ApplicationError("Invalid internship id", 400)
        }
        const internship = await this.internRepo.findById({ id: internId })
        if (!internship || internship.companyId.toString() !== companyId) {
            throw new NotFoundException("Internship not found")
        }
    }

    // ---- Student: apply ----
    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const internId = req.params.internId as string
            const { coverLetter } = req.body as { coverLetter?: string }
            const user = res.locals.user
            
            const internship = await this.getInternshipForApply(internId, companyId)
            // The company owner cannot apply to their own internship.
            if (internship.addedBy.toString() === user._id.toString()) {
                throw new ApplicationError("You cannot apply to your own internship", 400)
            }

            // CV resolution, in priority order:
            //   1. a freshly uploaded file (multipart "resume" field)
            //   2. otherwise the CV stored on the applicant's profile
            //   3. otherwise -> error
            const uploadedFile = req.file as Express.Multer.File | undefined
            let resume: { public_id: string, secure_url: string }

            const applicant = await this.userRepo.findById({ id: user._id.toString() })
            if (!applicant) {
                throw new NotFoundException("User not found")
            }

            if (uploadedFile) {
                const uploaded = await uploadSingleFile({
                    path: uploadedFile.path,
                    folder: `/users/${applicant.firstName}_${applicant._id}/applications`,
                })
                resume = { public_id: uploaded.public_id, secure_url: uploaded.secure_url }
            } else if (applicant.resume?.secure_url) {
                resume = {
                    public_id: applicant.resume.public_id,
                    secure_url: applicant.resume.secure_url,
                }
            } else {
                throw new ApplicationError(
                    "Please upload a CV file or add a CV to your profile before applying",
                    400,
                )
            }

            // Snapshot the resume at apply time. The compound unique index on
            // { internshipId, studentId } rejects duplicates with E11000.
            const applicationData: Partial<IApplication> = {
                internshipId: new mongoose.Types.ObjectId(internId),
                studentId: user._id,
                resume,
                status: ApplicationStatus.PENDING,
            }
            if (coverLetter) {
                applicationData.coverLetter = coverLetter
            }
            let application
            try {
                application = await this.applicationRepo.create({
                    data: applicationData
                })
            } catch (err: any) {
                if (err && err.code === 11000) {
                    throw new ApplicationError("You have already applied to this internship", 409)
                }
                throw err
            }

            return successHandler({ res, message: "Application submitted successfully", data: { application }, status: 201 })
        } catch (error) {
            next(error)
        }
    }

    // ---- Student: list my applications ----
    listMine = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.params
            const user = res.locals.user
            const { status, page = "1", limit = "10" } = req.query as Record<string, string | undefined>

            if (user._id.toString() !== userId) {
                throw new ApplicationError("You can only view your own applications", 403)
            }

            const filter: Record<string, any> = { studentId: user._id }
            if (status) filter.status = status

            const pageNum = Math.max(1, parseInt(page || "1", 10))
            const limitNum = Math.min(50, Math.max(1, parseInt(limit || "10", 10)))
            const skip = (pageNum - 1) * limitNum

            const [applications, total] = await Promise.all([
                this.applicationRepo.find({
                    filter,
                    options: {
                        skip,
                        limit: limitNum,
                        sort: { createdAt: -1 },
                        populate: [{ path: "internshipId", select: "title location workingTime" }],
                    },
                }),
                ApplicationModel.countDocuments(filter),
            ])

            return successHandler({
                res,
                message: "Applications fetched successfully",
                data: {
                    applications,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        pages: Math.ceil(total / limitNum),
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Student: cancel/withdraw (pending only) ----
    cancel = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { applicationId } = req.params
            const user = res.locals.user

            if (!isObjectIdOrHexString(applicationId)) {
                throw new ApplicationError("Invalid application id", 400)
            }

            const application = await this.applicationRepo.findOne({ filter: { _id: applicationId as string } })
            if (!application) {
                throw new NotFoundException("Application not found")
            }
            if (application.studentId.toString() !== user._id.toString()) {
                throw new ApplicationError("You can only cancel your own application", 403)
            }
            if (application.status !== ApplicationStatus.PENDING) {
                throw new ApplicationError("Only pending applications can be cancelled", 400)
            }

            await this.applicationRepo.deleteMany({ filter: { _id: new mongoose.Types.ObjectId(applicationId as string) } })

            return successHandler({ res, message: "Application cancelled successfully" })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: list applications for an internship ----
    listForInternship = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const internId = req.params.internId as string
            const { status, page = "1", limit = "10" } = req.query as Record<string, string | undefined>
            const user = res.locals.user

            await this.getOwnedInternship(internId, companyId, user._id.toString())

            const filter: Record<string, any> = { internshipId: new mongoose.Types.ObjectId(internId) }
            if (status) filter.status = status

            const pageNum = Math.max(1, parseInt(page || "1", 10))
            const limitNum = Math.min(50, Math.max(1, parseInt(limit || "10", 10)))
            const skip = (pageNum - 1) * limitNum

            const [applications, total] = await Promise.all([
                this.applicationRepo.find({
                    filter,
                    options: {
                        skip,
                        limit: limitNum,
                        sort: { createdAt: -1 },
                        populate: [{ path: "studentId", select: "firstName lastName email profilePicture headline" }],
                    },
                }),
                ApplicationModel.countDocuments(filter),
            ])

            return successHandler({
                res,
                message: "Applications fetched successfully",
                data: {
                    applications,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        pages: Math.ceil(total / limitNum),
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: accept or reject ----
    updateStatus = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const internId = req.params.internId as string
            const { applicationId } = req.params
            const { status } = req.body as { status: ApplicationStatus }
            const user = res.locals.user

            await this.getOwnedInternship(internId, companyId, user._id.toString())

            if (!isObjectIdOrHexString(applicationId)) {
                throw new ApplicationError("Invalid application id", 400)
            }

            const application = await this.applicationRepo.findOne({ filter: { _id: applicationId as string } })
            if (!application) {
                throw new NotFoundException("Application not found")
            }
            if (application.internshipId.toString() !== internId) {
                throw new NotFoundException("Application not found")
            }
            if (application.status !== ApplicationStatus.PENDING) {
                throw new ApplicationError("This application has already been reviewed", 400)
            }

            const updated = await this.applicationRepo.update({
                filter: { _id: new mongoose.Types.ObjectId(applicationId as string) },
                data: { status, reviewedBy: user._id },
                options: { returnDocument: "after" },
            })

            return successHandler({ res, message: `Application ${status}`, data: { application: updated } })
        } catch (error) {
            next(error)
        }
    }
}
