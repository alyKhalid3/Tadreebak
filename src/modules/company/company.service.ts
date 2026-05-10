import { NextFunction, Request, Response } from "express"
import { CompanyRepo } from "../../DB/repos/company.repo"
import { UserRepo } from "../../DB/repos/user.repo"
import mongoose, { HydratedDocument, isObjectIdOrHexString, Mongoose } from "mongoose"
import { ICompany } from "../../DB/types/company.type"
import { ApplicationError } from "../../utils/error"
import { destroySingleFile, uploadSingleFile } from "../../utils/multer/cloudinary.service"
import { successHandler } from "../../utils/successHandler"
import { NotFoundError } from "oblien"

import path from "path"
export class CompanyService {
    private companyRepo = new CompanyRepo()
    private userRepo = new UserRepo()
    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = req.body as HydratedDocument<ICompany>
            const user = res.locals.user
            const file = req.file as Express.Multer.File
            
            const company = await this.companyRepo.findOne({
                filter: {
                    $or: [{ name: data.name }, { companyEmail: data.companyEmail }],
                },
            });
            if (company)
                throw new ApplicationError('company name or email already exists', 400)
            const { public_id, secure_url } = await uploadSingleFile({ path: file.path, folder: `/users/${user.firstName}_${user._id}/companies` });
            const createdCompany = await this.companyRepo.create({ data: { ...data, createdBy: user._id, legalAttachment: { public_id, secure_url } } })
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
                throw new NotFoundError("Company not found")
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
    getCompanyByName = async (req: Request, res: Response, next: NextFunction) => {
        const { name } = req.params


        const company = await this.companyRepo.findOne({ filter: { name: name as string }, options: { select: "-legalAttachment" } })
        if (!company || company.deletedAt || company.bannedAt || !company.approvedByAdmin) {
            throw new NotFoundError("Company not found")
        }

        return successHandler({ res, message: "Company fetched successfully", data: { company } })
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
                throw new NotFoundError("Company not found")
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
                }
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

}