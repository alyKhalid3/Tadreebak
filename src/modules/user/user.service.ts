import mongoose, { isObjectIdOrHexString, ObjectId } from 'mongoose';
import { UserRepo } from './../../DB/repos/user.repo';
import { destroySingleFile, uploadSingleFile } from './../../utils/multer/cloudinary.service';
import multer from 'multer'
import { Request, Response, NextFunction } from 'express'
import { ApplicationError } from '../../utils/error'
import { successHandler } from '../../utils/successHandler'
import { toSafeUser } from '../../utils/safeUser';
import { cacheDel, cacheFlushPrefix } from '../../cache/cache';

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
    /**
     * Add a course (and optionally its certificate) to the authenticated
     * user's profile in a single call. Atomic: if the cert upload fails,
     * the course is NOT added.
     *
     * If no file is uploaded, the course is added with no certificate and
     * the user can attach one later via /user/upload/course-certificate/{index}.
     */
    addCourse = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const { name } = req.body as { name?: string }
            const file = req.file as Express.Multer.File | undefined

            if (!name || typeof name !== 'string') {
                throw new ApplicationError('Course name is required', 400)
            }
            const trimmedName = name.trim()
            if (trimmedName.length < 2 || trimmedName.length > 100) {
                throw new ApplicationError('Course name must be 2-100 characters', 400)
            }

            // Cap at 20 courses — same as the updateProfile schema.
            const currentUser = await this.userRepo.findById({ id: user._id.toString() })
            if (!currentUser) {
                throw new NotFoundException('User not found')
            }
            if ((currentUser.courses?.length ?? 0) >= 20) {
                throw new ApplicationError('Maximum 20 courses reached', 409)
            }

            let certificate: { public_id: string; secure_url: string; resourceType: 'image' | 'raw' } | undefined
            if (file) {
                const resourceType: 'image' | 'raw' = file.mimetype === 'application/pdf' ? 'raw' : 'image'
                try {
                    const uploaded = await uploadSingleFile({
                        path: file.path,
                        folder: `/users/${user.firstName}_${user._id}/courses/${(currentUser.courses?.length ?? 0)}/certificate`,
                        resourceType,
                    })
                    certificate = { ...uploaded, resourceType }
                } catch (uploadErr) {
                    // Multer already wrote the file to disk; nothing to clean there.
                    // Re-throw so the user knows the cert upload failed.
                    throw new ApplicationError('Failed to upload certificate', 502)
                }
            }

            // Push the new course onto the array. We use $push with $position
            // = length so the new course is always at the end, and the
            // returned index is `currentUser.courses.length` (the index of
            // the freshly added entry). If the cert upload failed, we never
            // reach this branch — the atomic guarantee.
            const newCourse: Record<string, any> = { name: trimmedName }
            if (certificate) newCourse.certificate = certificate

            const updated = await this.userRepo.update({
                filter: { _id: user._id },
                data: { $push: { courses: newCourse } },
                options: { returnDocument: 'after' },
            })

            const newIndex = (updated as any)?.courses?.length
                ? (updated as any).courses.length - 1
                : 0

            return successHandler({
                res,
                status: 201,
                message: 'Course added successfully',
                data: {
                    course: {
                        index: newIndex,
                        name: trimmedName,
                        certificate: certificate ?? null,
                    },
                },
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
            // Project to a safe DTO so we never leak password hash, OTPs, etc.
            const safe = toSafeUser(user.toObject()) as Record<string, any>
            safe.experience = experience
            return successHandler({ res, data: { user: safe } })
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
            // Project to the safe DTO so we don't return password hash / OTPs.
            const safe = toSafeUser(updatedUser.toObject ? updatedUser.toObject() : updatedUser)
            // Bust the cached user so the next request sees the new fields
            // (skills, bio, headline, etc).
            await cacheDel(`user:${userId}`)

            return successHandler({ res, message: 'Profile updated successfully', data: { user: safe } })
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
            await cacheDel(`user:${userId}`)

            return successHandler({ res, message: 'Account deleted successfully' })
        } catch (error) {
            next(error)
        }
    }
}