import { NextFunction, Request, Response } from "express";
import { internRepo } from "../../DB/repos/intern.repo";
import { ApplicationError, NotFoundException } from "../../utils/error";
import { successHandler } from "../../utils/successHandler";
import { CompanyRepo } from "../../DB/repos/company.repo";
import mongoose, { isObjectIdOrHexString } from "mongoose";
import { IInternShip } from "../../DB/types/internship.type";
import { InternShipModel } from "../../DB/models/internship.model";

export class InternService {
    private internRepo = new internRepo
    private companyRepo = new CompanyRepo

    create = async (req: Request, res: Response, next: NextFunction) => {
        const companyId = req.params.companyId as string
        const { title, description, location, workingTime, softSkills, technicalSkills } = req.body as Record<string, any>
        const user = res.locals.user

        if (!isObjectIdOrHexString(companyId)) {
            throw new ApplicationError("Invalid company id", 400)
        }

        const company = await this.companyRepo.findById({ id: companyId })
        if (!company || company.deletedAt || company.bannedAt || !company.approvedByAdmin) {
            throw new NotFoundException("Company not found")
        }
        if (company.createdBy.toString() !== user._id.toString()) {
            throw new ApplicationError("You are not the owner of this company", 403)
        }

        const internship = await this.internRepo.create({
            data: {
                title,
                description,
                location,
                workingTime,
                softSkills: softSkills as string[],
                technicalSkills: technicalSkills as string[],
                companyId,
                addedBy: user._id,
                updatedBy: user._id,
            }
        })

        return successHandler({ res, message: "Internship created successfully", data: { internship }, status: 201 })
    }

    update = async (req: Request, res: Response, next: NextFunction) => {
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

        const company = await this.companyRepo.findById({ id: internship.companyId })
        if (!company || company.createdBy.toString() !== user._id.toString()) {
            throw new ApplicationError("You are not the owner of this internship's company", 403)
        }

        const updated = await this.internRepo.update({
            filter: { _id: mongoose.Types.ObjectId.createFromHexString(internId) },
            data: { ...data, updatedBy: user._id },
            options: { returnDocument: "after" },
        })

        return successHandler({ res, message: "Internship updated successfully", data: { internship: updated } })
    }

    delete = async (req: Request, res: Response, next: NextFunction) => {
        const internId = req.params.internId as string
        const user = res.locals.user

        if (!isObjectIdOrHexString(internId)) {
            throw new ApplicationError("Invalid internship id", 400)
        }

        const internship = await this.internRepo.findById({ id: internId })
        if (!internship) {
            throw new NotFoundException("Internship not found")
        }

        const company = await this.companyRepo.findById({ id: internship.companyId })
        if (!company || company.createdBy.toString() !== user._id.toString()) {
            throw new ApplicationError("You are not the owner of this internship's company", 403)
        }

        await this.internRepo.deleteMany({ filter: { _id: mongoose.Types.ObjectId.createFromHexString(internId) } })

        return successHandler({ res, message: "Internship deleted successfully" })
    }

    list = async (req: Request, res: Response, next: NextFunction) => {
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
    }

    getInternById = async (req: Request, res: Response, next: NextFunction) => {
        const internId = req.params.internId as string

        if (!isObjectIdOrHexString(internId)) {
            throw new ApplicationError("Invalid internship id", 400)
        }

        const internship = await this.internRepo.findById({ id: internId, options: { populate: ["companyId"] } })
        if (!internship) {
            throw new NotFoundException("Internship not found")
        }

        return successHandler({ res, message: "Internship fetched successfully", data: { internship } })
    }
}
