import { NextFunction, Request, Response } from "express"
import { CompanyRepo } from "../../DB/repos/company.repo"
import { UserRepo } from "../../DB/repos/user.repo"
import mongoose, { HydratedDocument, isObjectIdOrHexString, Mongoose } from "mongoose"
import { ICompany } from "../../DB/types/company.type"
import { ApplicationError, NotFoundException } from "../../utils/error"
import { destroySingleFile, uploadSingleFile } from "../../utils/multer/cloudinary.service"
import { successHandler } from "../../utils/successHandler"
import { companyModel } from "../../DB/models/company.model"
import { UserRoleEnum } from "../../DB/types/user.type"
import { notificationEmitter } from "../../utils/notifications/notificationEvents"
import { NotificationType } from "../../DB/types/notification.type"

export class CompanyService {
    private companyRepo = new CompanyRepo()
    private userRepo = new UserRepo()
    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = req.body as HydratedDocument<ICompany>
            const user = res.locals.user
            const file = req.file as Express.Multer.File

         
            if (!file) {
                throw new ApplicationError('Legal attachment PDF is required', 400)
            }

            const company = await this.companyRepo.findOne({
                filter: {
                    $or: [{ name: data.name }, { companyEmail: data.companyEmail }],
                },
            });
            if (company)
                throw new ApplicationError('company name or email already exists', 400)
            const { public_id, secure_url } = await uploadSingleFile({
                path: file.path,
                folder: `/users/${user.firstName}_${user._id}/companies`,
                resourceType: "raw",
            });
            const createdCompany = await this.companyRepo.create({ data: { ...data, createdBy: user._id, legalAttachment: { public_id, secure_url } } })

            // Promote the creator to COMPANY_OWNER. Role is granted at creation
            // time (per product decision); they still can't post internships
            // until an admin approves the company.
            if (user.role !== UserRoleEnum.COMPANY_OWNER) {
                await this.userRepo.update({
                    filter: { _id: user._id },
                    data: { role: UserRoleEnum.COMPANY_OWNER }
                })
            }

            return successHandler({ res, message: "Company created successfully", data: { company: createdCompany } })

        } catch (error) {
            next(error)
        }
    }
    updateCompany = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            const data = req.body as Partial<ICompany>
            const user = res.locals.user
            if (!isObjectIdOrHexString(companyId)) {
                throw new ApplicationError("Invalid company id", 400)
            }
            const company = await this.companyRepo.findOne({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) }
            })
            if (
                !company ||
                company.deletedAt ||
                company.bannedAt ||
                !company.approvedByAdmin ||
                company.createdBy.toString() !== user._id.toString()
            ) {
                throw new NotFoundException("Company not found")
            }
            const updatedCompany = await this.companyRepo.update({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) },
                data: {
                    ...data,
                },
                options: { returnDocument: "after" },
            })
            return successHandler({ res, message: "Company updated successfully", data: { company: updatedCompany } })
        } catch (error) {
            next(error)
        }
    }
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { name, industry, address, page = "1", limit = "10" } = req.query as Record<string, string | undefined>

            const filter: Record<string, any> = { deletedAt: null, bannedAt: null, approvedByAdmin: true }

            if (name) filter.name = { $regex: name, $options: "i" }
            if (industry) filter.industry = { $regex: industry, $options: "i" }
            if (address) filter.address = { $regex: address, $options: "i" }
            const pageNum = Math.max(1, parseInt(page || "1", 10))
            const limitNum = Math.min(50, Math.max(1, parseInt(limit || "10", 10)))
            const skip = (pageNum - 1) * limitNum

            const [companies, total] = await Promise.all([
                this.companyRepo.find({
                    filter, options: {
                        skip,
                        limit: limitNum,
                        sort: { createdAt: -1 },
                        populate: [{ path: "createdBy", select: "firstName lastName email profilePicture" }],
                        select: "-legalAttachment -companyEmail -approvedByAdmin" // Exclude legalAttachment from the response
                    }
                }),
                companyModel.countDocuments(filter),
            ])

            return successHandler({
                res,
                message: "Companies fetched successfully",
                data: {
                    companies,
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
    getCompany = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params

            if (!isObjectIdOrHexString(companyId)) {
                throw new ApplicationError("Invalid company id", 400)
            }

            const company = await this.companyRepo.findOne({ filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) }, options: { populate: [{ path: "createdBy", select: "firstName lastName email profilePicture" }] } })
            if (
                !company ||
                company.deletedAt ||
                company.bannedAt ||
                !company.approvedByAdmin
            ) {
                throw new NotFoundException("Company not found")
            }

            return successHandler({ res, message: "Company fetched successfully", data: { company } })
        } catch (error) {
            next(error)
        }
    }
    getCompanyByName = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { name } = req.params


            const company = await this.companyRepo.findOne({ filter: { name: name as string }, options: { select: "-legalAttachment" } })
            if (!company || company.deletedAt || company.bannedAt || !company.approvedByAdmin) {
                throw new NotFoundException("Company not found")
            }

            return successHandler({ res, message: "Company fetched successfully", data: { company } })
        } catch (error) {
            next(error)
        }
    }
    uploadMedia = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const { companyId, type } = req.params
            const file = req.file as Express.Multer.File
            if (!isObjectIdOrHexString(companyId)) {
                throw new ApplicationError("Invalid company id", 400)
            }
            if (!file) {
                throw new ApplicationError("File is required", 400)
            }

            const company = await this.companyRepo.findOne({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) }
            })

            if (
                !company ||
                company.deletedAt ||
                company.bannedAt ||
                !company.approvedByAdmin
            ) {
                throw new NotFoundException("Company not found")
            }

            if (company.createdBy.toString() !== user._id.toString()) {
                throw new ApplicationError("Unauthorized", 403)
            }

            const { public_id, secure_url } = await uploadSingleFile({
                path: file.path,
                folder: `/users/${user.firstName}_${user._id}/companies/${type}`
            })
            const media = company[type as keyof ICompany] as
                | { public_id: string }
                | undefined
            if (media?.public_id) {
                await destroySingleFile(media.public_id)
            }
            const updatedCompany = await this.companyRepo.update({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) },
                data: {
                    [type as string]: { public_id, secure_url }
                },
                options: { returnDocument: "after" },
            })

            return successHandler({
                res,
                message: "Media uploaded successfully",
                data: { company: updatedCompany }
            })

        } catch (error) {
            next(error)
        }
    }

    // ---- Admin: list companies pending approval ----
    listPending = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { page = "1", limit = "10" } = req.query as Record<string, string | undefined>

            const filter: Record<string, any> = { approvedByAdmin: false, deletedAt: null, bannedAt: null }

            const pageNum = Math.max(1, parseInt(page || "1", 10))
            const limitNum = Math.min(50, Math.max(1, parseInt(limit || "10", 10)))
            const skip = (pageNum - 1) * limitNum

            const [companies, total] = await Promise.all([
                this.companyRepo.find({
                    filter,
                    options: {
                        skip,
                        limit: limitNum,
                        sort: { createdAt: -1 },
                        populate: [{ path: "createdBy", select: "firstName lastName email profilePicture" }],
                    },
                }),
                companyModel.countDocuments(filter),
            ])

            return successHandler({
                res,
                message: "Pending companies fetched successfully",
                data: {
                    companies,
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

    // ---- Admin: ban a company ----
    banCompany = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            if (!isObjectIdOrHexString(companyId)) {
                throw new ApplicationError("Invalid company id", 400)
            }
            const company = await this.companyRepo.findOne({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) },
            })
            if (!company || company.deletedAt) {
                throw new NotFoundException("Company not found")
            }
            if (company.bannedAt) {
                throw new ApplicationError("Company is already banned", 400)
            }
            await this.companyRepo.update({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) },
                data: { bannedAt: new Date() },
            })

            notificationEmitter.publish(NotificationType.COMPANY_BANNED, {
                recipient: company.createdBy.toString(),
                data: { companyId: company._id.toString(), companyName: company.name },
            })

            return successHandler({ res, message: "Company banned successfully" })
        } catch (error) {
            next(error)
        }
    }

    // ---- Admin: unban a company ----
    unbanCompany = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            if (!isObjectIdOrHexString(companyId)) {
                throw new ApplicationError("Invalid company id", 400)
            }
            const company = await this.companyRepo.findOne({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) },
            })
            if (!company || company.deletedAt) {
                throw new NotFoundException("Company not found")
            }
            if (!company.bannedAt) {
                throw new ApplicationError("Company is not banned", 400)
            }
            await this.companyRepo.update({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) },
                data: { bannedAt: null },
            })

            notificationEmitter.publish(NotificationType.COMPANY_UNBANNED, {
                recipient: company.createdBy.toString(),
                data: { companyId: company._id.toString(), companyName: company.name },
            })

            return successHandler({ res, message: "Company unbanned successfully" })
        } catch (error) {
            next(error)
        }
    }

    // ---- Admin: approve a company ----
    approveCompanyAdmin = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { companyId } = req.params
            if (!isObjectIdOrHexString(companyId)) {
                throw new ApplicationError("Invalid company id", 400)
            }
            const company = await this.companyRepo.findById({ id: companyId as string })
            if (!company) {
                throw new ApplicationError("Company not found", 404)
            }
            if (company.approvedByAdmin) {
                throw new ApplicationError("Company is already approved", 400)
            }
            await this.companyRepo.update({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(companyId as string) },
                data: { approvedByAdmin: true }
            })

            notificationEmitter.publish(NotificationType.COMPANY_APPROVED, {
                recipient: company.createdBy.toString(),
                data: { companyId: company._id.toString(), companyName: company.name },
            })

            return successHandler({ res, message: "Company approved successfully" })
        } catch (error) {
            next(error)
        }
    }

}
