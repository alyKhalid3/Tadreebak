import { NextFunction, Request, Response } from "express";
import { InternRepo } from "../../DB/repos/intern.repo";
import { ApplicationError, NotFoundException } from "../../utils/error";
import { successHandler } from "../../utils/successHandler";
import mongoose, { isObjectIdOrHexString } from "mongoose";
import { InternShipModel } from "../../DB/models/internship.model";
import { assertOwnedCompany } from "../../utils/companyAccess";
import { ApplicationRepo } from "../../DB/repos/application.repo";

export class InternService {
    private internRepo = new InternRepo
    private applicationRepo = new ApplicationRepo

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const { title, description, location, workingTime, softSkills, technicalSkills } = req.body as Record<string, any>
            const user = res.locals.user

            await assertOwnedCompany(companyId, user._id.toString())

            const internship = await this.internRepo.create({
                data: {
                    title,
                    description,
                    location,
                    workingTime,
                    softSkills: softSkills as string[],
                    technicalSkills: technicalSkills as string[],
                    companyId: new mongoose.Types.ObjectId(companyId),
                    addedBy: user._id,
                    updatedBy: user._id,
                }
            })

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
