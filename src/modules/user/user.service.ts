import mongoose, { isObjectIdOrHexString, ObjectId } from 'mongoose';
import { UserRepo } from './../../DB/repos/user.repo';
import { destroySingleFile, uploadSingleFile } from './../../utils/multer/cloudinary.service';
import multer from 'multer'
import { Request, Response, NextFunction } from 'express'
import { ApplicationError } from '../../utils/error'
import { successHandler } from '../../utils/successHandler'

import { CompanyRepo } from '../../DB/repos/company.repo';
import { NotFoundException } from '../../utils/error';


export class UserService {
    constructor() { }
    private userRepo = new UserRepo()
    private companyRepo = new CompanyRepo() // to avoid circular dependency between user and company repos as company repo needs user repo to update the company employees
    uploadMedia = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { type } = req.params
            const user = res.locals.user
            const file = req.file as Express.Multer.File
            if (type !== 'profilePicture' && type !== 'coverPicture') {
                throw new ApplicationError('params type must be profilePicture or coverPicture', 400)
            }
            if (!file) {
                throw new ApplicationError("File is required", 400)
            }
            const { public_id, secure_url } = await uploadSingleFile({ path: file.path, folder: `/users/${user.firstName}_${user._id}/companies/${type}` })
            const old = user[type]
            if (old?.public_id) {
                await destroySingleFile(old.public_id)
            }
            const updatedUser = await this.userRepo.update({
                filter: { _id: user._id },
                data: {
                    [type as string]: {
                        public_id,
                        secure_url
                    }
                }
            })
            return successHandler({ res, message: "image uploaded successfully", data: { url: secure_url, public_id: public_id } })
        } catch (error) {
            next(error)
        }
    }
    uploadResume = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const file = req.file as Express.Multer.File
            if (!file) {
                throw new ApplicationError("Resume file is required", 400)
            }
            const { public_id, secure_url } = await uploadSingleFile({
                path: file.path,
                folder: `/users/${user.firstName}_${user._id}/resume`,
                resourceType: "raw",
            })
            // Destroy the previous resume (if any) to avoid orphaned Cloudinary assets.
            if (user.resume?.public_id) {
                await destroySingleFile(user.resume.public_id, "raw")
            }
            await this.userRepo.update({
                filter: { _id: user._id },
                data: { resume: { public_id, secure_url } }
            })
            return successHandler({ res, message: "Resume uploaded successfully", data: { url: secure_url, public_id } })
        } catch (error) {
            next(error)
        }
    }
    getProfile = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.params
            if (!isObjectIdOrHexString(userId)) {
                throw new ApplicationError('Invalid user id', 400)
            }
            const user = await this.userRepo.findById({ id: userId as string })
            if (!user) {
                throw new NotFoundException('User not found')
            }
            const safeUser = (({ _id, firstName, lastName, email, phoneNumber, role, isConfirmed, provider, profilePicture, coverPicture, bio, headline, skills, education, experience, resume, dateOfBirth, gender, address, categories }) =>
                ({ _id, firstName, lastName, email, phoneNumber, role, isConfirmed, provider, profilePicture, coverPicture, bio, headline, skills, education, experience, resume, dateOfBirth, gender, address, categories }))(user.toObject())
            return successHandler({ res, data: { user: safeUser } })
        } catch (error) {
            next(error)
        }
    }
    updateProfile = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.params
            const user = res.locals.user
            if (user._id.toString() !== userId) {
                throw new ApplicationError('You can only update your own profile', 403)
            }
            const { phone, ...updates } = req.body
            const data: any = { ...updates }
            if (phone) {
                data.phoneNumber = phone
            }
            const updatedUser = await this.userRepo.update({
                filter: { _id: mongoose.Types.ObjectId.createFromHexString(userId as string) },
                data
            })
            if (!updatedUser) {
                throw new NotFoundException('User not found')
            }
            return successHandler({ res, message: 'Profile updated successfully', data: { user: updatedUser } })
        } catch (error) {
            next(error)
        }
    }
    deleteAccount = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.params
            const user = res.locals.user
            if (user._id.toString() !== userId) {
                throw new ApplicationError('You can only delete your own account', 403)
            }
            await this.userRepo.deleteMany({ filter: { _id: mongoose.Types.ObjectId.createFromHexString(userId as string) } })
            return successHandler({ res, message: 'Account deleted successfully' })
        } catch (error) {
            next(error)
        }
    }
}