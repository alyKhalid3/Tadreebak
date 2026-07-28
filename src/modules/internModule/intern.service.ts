import { NextFunction, Request, Response } from "express";
import { InternRepo } from "../../DB/repos/intern.repo";
import { ApplicationError, NotFoundException } from "../../utils/error";
import { successHandler } from "../../utils/successHandler";
import mongoose, { isObjectIdOrHexString } from "mongoose";
import { InternShipModel } from "../../DB/models/internship.model";
import { companyModel } from "../../DB/models/company.model";
import { assertOwnedCompany } from "../../utils/companyAccess";
import { ApplicationRepo } from "../../DB/repos/application.repo";
import { UserRepo } from "../../DB/repos/user.repo";
import { UserRoleEnum } from "../../DB/types/user.type";
import { emailEmitter } from "../../utils/sendEmail/emailEvents";
import { internshipNotificationTemplate } from "../../utils/sendEmail/generateHtml";

export class InternService {
    private internRepo = new InternRepo
    private applicationRepo = new ApplicationRepo

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const { title, description, location, workingTime, softSkills, technicalSkills, questions, preKnowledge, track, requiredEducation } = req.body as Record<string, any>
            const user = res.locals.user

            const company = await assertOwnedCompany(companyId, user._id.toString())

            if (company.internshipCredits <= 0) {
                throw new ApplicationError(
                    "You have reached your internship posting limit. Purchase a plan to post more internships.",
                    402,
                )
            }

            const internship = await this.internRepo.create({
                data: {
                    title,
                    description,
                    location,
                    workingTime,
                    softSkills: softSkills as string[],
                    technicalSkills: technicalSkills as string[],
                    questions,
                    preKnowledge,
                    track,
                    requiredEducation,
                    companyId: new mongoose.Types.ObjectId(companyId),
                    addedBy: user._id,
                    updatedBy: user._id,
                }
            })

            await companyModel.updateOne(
                { _id: new mongoose.Types.ObjectId(companyId), internshipCredits: { $gt: 0 } },
                { $inc: { internshipCredits: -1 } },
            )

            // Notify matching students in background: those who selected the internship `track`
            void (async () => {
                try {
                    const userRepo = new UserRepo()
                    const institutions: string[] = Array.isArray(requiredEducation) ? requiredEducation.map((e: any) => e?.institution).filter(Boolean) : []
                    const trackStr = typeof track === 'string' && track.trim() ? track.trim() : undefined

                    if (!trackStr && institutions.length === 0) return

                    const filter: Record<string, any> = { role: UserRoleEnum.STUDENT }
                    if (trackStr) filter.categories = trackStr
                    if (institutions.length) filter['education.institution'] = { $in: institutions }

                    const students = await userRepo.find({ filter, projection: 'firstName lastName email _id', options: { lean: true } })
                    const seen = new Set<string>()
                    for (const s of students) {
                        if (!s || !s.email) continue
                        // Skip notifying the company owner who created this internship
                        if (s._id && s._id.toString() === user._id.toString()) continue
                        if (seen.has(s.email)) continue
                        seen.add(s.email)

                        const subject = `New internship matching your interests: ${title}`
                        const html = internshipNotificationTemplate({
                            studentName: s.firstName ?? `${s.email}`,
                            internshipTitle: title,
                            companyName: company.name ?? '',
                            track: trackStr,
                            location,
                            link: `${process.env.APP_URL ?? ''}/internships/${(internship as any)._id}`,
                            subject,
                        })

                        emailEmitter.publish('send-email-new-internship', { to: s.email, subject, html })
                    }
                } catch (err) {
                    console.error('Failed to notify matching students about new internship:', err)
                }
            })()

            return successHandler({ res, message: "Internship created successfully", data: { internship }, status: 201 })
        } catch (error) {
            next(error)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const internId = req.params.internId as string
            const data = req.body
            const user = res.locals.user

            if (!isObjectIdOrHexString(internId)) {
                throw new ApplicationError("Invalid internship id", 400)
            }

            const internship = await this.internRepo.findById({ id: internId })
            if (!internship) {
                throw new NotFoundException("Internship not found")
            }

            await assertOwnedCompany(internship.companyId.toString(), user._id.toString())

            const updated = await this.internRepo.update({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(internId) },
                data: { ...data, updatedBy: user._id },
                options: { returnDocument: "after" },
            })

            return successHandler({ res, message: "Internship updated successfully", data: { internship: updated } })
        } catch (error) {
            next(error)
        }
    }

    delete = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const internId = req.params.internId as string
            const user = res.locals.user

            if (!isObjectIdOrHexString(internId)) {
                throw new ApplicationError("Invalid internship id", 400)
            }

            const internship = await this.internRepo.findById({ id: internId })
            if (!internship) {
                throw new NotFoundException("Internship not found")
            }

            await assertOwnedCompany(internship.companyId.toString(), user._id.toString())

            const internObjectId = mongoose.Types.ObjectId.createFromHexString(internId)

            // Cascade-delete applications so no orphaned docs remain pointing at
            // a non-existent internship.
            await Promise.all([
                this.internRepo.deleteMany({ filter: { _id: internObjectId } }),
                this.applicationRepo.deleteMany({ filter: { internshipId: internObjectId } }),
            ])

            return successHandler({ res, message: "Internship deleted successfully" })
        } catch (error) {
            next(error)
        }
    }

    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { type, location, companyId, title, closed, page = "1", limit = "10" } = req.query as Record<string, string | undefined>

            const filter: Record<string, any> = { closed: { $ne: true } }

            if (type) filter.workingTime = type
            if (location) filter.location = location
            if (companyId) filter.companyId = companyId
            if (title) filter.title = { $regex: title, $options: "i" }
            if (closed === "true") filter.closed = true
            if (closed === "false") filter.closed = false

            const pageNum = Math.max(1, parseInt(page || "1", 10))
            const limitNum = Math.min(50, Math.max(1, parseInt(limit || "10", 10)))
            const skip = (pageNum - 1) * limitNum

            const [internships, total] = await Promise.all([
                this.internRepo.find({ filter, options: { skip, limit: limitNum, sort: { createdAt: -1 } } }),
                InternShipModel.countDocuments(filter),
            ])

            return successHandler({
                res,
                message: "Internships fetched successfully",
                data: {
                    internships,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        pages: Math.ceil(total / limitNum),
                    }
                }
            })
        } catch (error) {
            next(error)
        }
    }

    getInternById = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const internId = req.params.internId as string

            if (!isObjectIdOrHexString(internId)) {
                throw new ApplicationError("Invalid internship id", 400)
            }

            const internship = await this.internRepo.findById({ id: internId, options: { populate: ["companyId"] } })
            if (!internship) {
                throw new NotFoundException("Internship not found")
            }

            return successHandler({ res, message: "Internship fetched successfully", data: { internship } })
        } catch (error) {
            next(error)
        }
    }
}
