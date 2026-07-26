import mongoose, { isObjectIdOrHexString, ObjectId } from 'mongoose';
import { UserRepo } from './../../DB/repos/user.repo';
import { destroySingleFile, uploadSingleFile } from './../../utils/multer/cloudinary.service';
import multer from 'multer'
import { Request, Response, NextFunction } from 'express'
import { ApplicationError } from '../../utils/error'
import { successHandler } from '../../utils/successHandler'

import { CompanyRepo } from '../../DB/repos/company.repo';
import { NotFoundException } from '../../utils/error';
import { ApplicationModel } from '../../DB/models/application.model';
import { ApplicationStatus } from '../../DB/types/application.type';
import { RatingModel } from '../../DB/models/rating.model';
import { RatingFrom } from '../../DB/types/rating.type';
import { UserRoleEnum } from '../../DB/types/user.type';


export class UserService {
    constructor() { }
    private userRepo = new UserRepo()
    private companyRepo = new CompanyRepo() // to avoid circular dependency between user and company repos as company repo needs user repo to update the company employees

    private async buildStudentExperience(userId: string) {
        const completedApplications = await ApplicationModel.find({
            studentId: userId,
            status: ApplicationStatus.ACCEPTED,
            completed: true,
        })
            .populate({
                path: 'internshipId',
                select: 'title companyId',
                populate: { path: 'companyId', select: 'name' },
            })
            .sort({ completedAt: -1, createdAt: -1 })

        const applicationIds = completedApplications.map((application) => application._id)
        const ratings = await RatingModel.find({
            applicationId: { $in: applicationIds },
            from: RatingFrom.COMPANY,
        }).select('applicationId score comment createdAt')

        const ratingByApplicationId = new Map(ratings.map((rating) => [rating.applicationId.toString(), rating]))

        return completedApplications.map((application) => {
            const internship = application.internshipId as any
            const company = internship?.companyId as any
            const companyRating = ratingByApplicationId.get(application._id.toString())

            return {
                applicationId: application._id,
                internshipId: internship?._id,
                internshipTitle: internship?.title,
                companyId: company?._id,
                companyName: company?.name,
                completedAt: application.completedAt ,
                rating: companyRating?.score ?? null,
                feedback: companyRating?.comment ?? null,
                feedbackCreatedAt: companyRating?.createdAt ?? null,
            }
        })
    }

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
    uploadCourseCertificate = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const { courseIndex } = req.params
            const file = req.file as Express.Multer.File
            if (typeof courseIndex !== 'string') {
                throw new ApplicationError('Invalid course index', 400)
            }
            const index = Number.parseInt(courseIndex, 10)
            if (!Number.isInteger(index) || index < 0) {
                throw new ApplicationError('Invalid course index', 400)
            }
            if (!file) {
                throw new ApplicationError('Certificate file is required', 400)
            }

            const currentUser = await this.userRepo.findById({ id: user._id.toString() })
            const course = currentUser?.courses?.[index]
            if (!course) {
                throw new NotFoundException('Course not found')
            }

            const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image'
            const { public_id, secure_url } = await uploadSingleFile({
                path: file.path,
                folder: `/users/${user.firstName}_${user._id}/courses/${index}/certificate`,
                resourceType,
            })

            if (course.certificate?.public_id) {
                await destroySingleFile(course.certificate.public_id, course.certificate.resourceType ?? resourceType)
            }

            await this.userRepo.update({
                filter: { _id: user._id },
                data: { [`courses.${index}.certificate`]: { public_id, secure_url, resourceType } } as any,
            })

            return successHandler({
                res,
                message: 'Course certificate uploaded successfully',
                data: { certificate: { public_id, secure_url, resourceType } },
            })
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
            const experience = user.role === UserRoleEnum.STUDENT
                ? await this.buildStudentExperience(user._id.toString())
                : user.experience
            const safeUser = (({ _id, firstName, lastName, email, phoneNumber, role, isConfirmed, provider, profilePicture, coverPicture, bio, headline, skills, education, courses, resume, dateOfBirth, gender, address, categories }) =>
                ({ _id, firstName, lastName, email, phoneNumber, role, isConfirmed, provider, profilePicture, coverPicture, bio, headline, skills, education, experience, courses, resume, dateOfBirth, gender, address, categories }))(user.toObject())
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
            if ('experience' in data) {
                throw new ApplicationError('Experience is read-only', 400)
            }
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