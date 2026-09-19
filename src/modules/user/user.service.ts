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
import { buildFileProxyUrl } from '../../utils/multer/fileProxy';


export class UserService {
    constructor() { }
    private userRepo = new UserRepo()
    private companyRepo = new CompanyRepo() // to avoid circular dependency between user and company repos as company repo needs user repo to update the company employees

    // PDF certificates are raw Cloudinary files without an extension, so the
    // browser would download them instead of opening inline. Serve them through
    // the authenticated file-proxy — the same mechanism that opens CVs.
    private certWithUrl(certificate: { public_id: string; secure_url: string; resourceType: 'image' | 'raw' }, origin: string) {
        if (certificate.resourceType === 'raw') {
            return { ...certificate, certificateUrl: buildFileProxyUrl(origin, 'course-certificate.pdf', certificate.secure_url) }
        }
        return certificate
    }

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

            const origin = `${req.protocol}://${req.get('host')}`
            return successHandler({
                res,
                message: 'Course certificate uploaded successfully',
                data: { certificate: this.certWithUrl({ public_id, secure_url, resourceType }, origin) },
            })
        } catch (error) {
            next(error)
        }
    }
    /**
     * Update one course of the authenticated user: rename it, edit
     * its date window / description, and/or replace its certificate
     * (multipart). 404 when the course doesn't exist.
     */
    updateCourse = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const { courseIndex } = req.params
            const body = req.body as Record<string, any>
            const file = req.file as Express.Multer.File | undefined

            if (typeof courseIndex !== 'string') {
                throw new ApplicationError('Invalid course index', 400)
            }
            const index = Number.parseInt(courseIndex, 10)
            if (!Number.isInteger(index) || index < 0) {
                throw new ApplicationError('Invalid course index', 400)
            }

            // Pull the optional fields out of the multipart body. Date
            // strings get coerced by the Zod layer in the controller,
            // but we accept the strings here too — service is the
            // single source of truth.
            const rawName = typeof body.name === 'string' ? body.name.trim() : ''
            const trimmedName = rawName === '' ? undefined : rawName
            if (trimmedName !== undefined && (trimmedName.length < 2 || trimmedName.length > 100)) {
                throw new ApplicationError('Course name must be 2-100 characters', 400)
            }

            const present = body.present === 'true' || body.present === true || body.present === '1' || body.present === 1
                ? true
                : body.present === 'false' || body.present === false || body.present === '0' || body.present === 0
                    ? false
                    : undefined
            const startDateRaw = body.startDate
            const endDateRaw = body.endDate
            const description = typeof body.description === 'string' ? body.description : undefined

            const startDate = startDateRaw ? new Date(startDateRaw) : undefined
            const endDate = endDateRaw === '' || endDateRaw === 'null' ? null
                : endDateRaw ? new Date(endDateRaw) : undefined

            if (startDate && Number.isNaN(startDate.getTime())) {
                throw new ApplicationError('Invalid startDate', 400)
            }
            if (endDate && Number.isNaN(endDate.getTime())) {
                throw new ApplicationError('Invalid endDate', 400)
            }
            if (startDate && endDate && endDate < startDate) {
                throw new ApplicationError('endDate must be on or after startDate', 400)
            }
            if (description !== undefined && description.length > 1000) {
                throw new ApplicationError('Course description must be at most 1000 characters', 400)
            }

            const hasAnyField =
                trimmedName !== undefined ||
                file !== undefined ||
                startDate !== undefined ||
                endDate !== undefined ||
                present !== undefined ||
                description !== undefined
            if (!hasAnyField) {
                throw new ApplicationError('Nothing to update — provide a name, certificate, dates, or description', 400)
            }

            const currentUser = await this.userRepo.findById({ id: user._id.toString() })
            if (!currentUser) {
                throw new NotFoundException('User not found')
            }
            const course = currentUser.courses?.[index]
            if (!course) {
                throw new NotFoundException('Course not found')
            }

            // Upload the replacement certificate before touching the DB so a
            // failed upload leaves the course untouched. Old asset destroyed
            // after a successful upload (same order as uploadCourseCertificate).
            let certificate: { public_id: string; secure_url: string; resourceType: 'image' | 'raw' } | undefined
            if (file) {
                const resourceType: 'image' | 'raw' = file.mimetype === 'application/pdf' ? 'raw' : 'image'
                const uploaded = await uploadSingleFile({
                    path: file.path,
                    folder: `/users/${user.firstName}_${user._id}/courses/${index}/certificate`,
                    resourceType,
                })
                certificate = { ...uploaded, resourceType }
                if (course.certificate?.public_id) {
                    await destroySingleFile(course.certificate.public_id, course.certificate.resourceType ?? resourceType)
                }
            }

            const data: Record<string, any> = {}
            if (trimmedName !== undefined) data[`courses.${index}.name`] = trimmedName
            if (certificate) data[`courses.${index}.certificate`] = certificate
            if (startDate !== undefined) data[`courses.${index}.startDate`] = startDate
            if (endDate !== undefined) data[`courses.${index}.endDate`] = endDate
            if (present !== undefined) data[`courses.${index}.present`] = present
            if (description !== undefined) data[`courses.${index}.description`] = description

            await this.userRepo.update({
                filter: { _id: user._id },
                data,
            })

            // Bust the cached profile so the next read reflects the change.
            await cacheDel(`user:${user._id.toString()}`)

            const origin = `${req.protocol}://${req.get('host')}`
            const updatedCourse = {
                index,
                name: trimmedName ?? course.name,
                startDate: startDate ?? course.startDate ?? null,
                endDate: endDate !== undefined ? endDate : course.endDate ?? null,
                present: present !== undefined ? present : course.present ?? false,
                description: description ?? course.description ?? null,
                certificate: certificate
                    ? this.certWithUrl(certificate, origin)
                    : course.certificate
                        ? this.certWithUrl(course.certificate as { public_id: string; secure_url: string; resourceType: 'image' | 'raw' }, origin)
                        : null,
            }
            return successHandler({
                res,
                message: 'Course updated successfully',
                data: { course: updatedCourse },
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
            const body = req.body as Record<string, any>
            const file = req.file as Express.Multer.File | undefined

            const name = typeof body.name === 'string' ? body.name.trim() : ''
            if (!name) {
                throw new ApplicationError('Course name is required', 400)
            }
            if (name.length < 2 || name.length > 100) {
                throw new ApplicationError('Course name must be 2-100 characters', 400)
            }

            const presentRaw = body.present
            const present = presentRaw === 'true' || presentRaw === true || presentRaw === '1' || presentRaw === 1
                ? true
                : presentRaw === 'false' || presentRaw === false || presentRaw === '0' || presentRaw === 0
                    ? false
                    : undefined

            const startDateRaw = body.startDate
            const endDateRaw = body.endDate
            const startDate = startDateRaw ? new Date(startDateRaw) : undefined
            const endDate = endDateRaw === '' || endDateRaw === 'null' ? null
                : endDateRaw ? new Date(endDateRaw) : undefined

            if (startDate && Number.isNaN(startDate.getTime())) {
                throw new ApplicationError('Invalid startDate', 400)
            }
            if (endDate && Number.isNaN(endDate.getTime())) {
                throw new ApplicationError('Invalid endDate', 400)
            }
            if (startDate && endDate && endDate < startDate) {
                throw new ApplicationError('endDate must be on or after startDate', 400)
            }

            const description = typeof body.description === 'string' ? body.description : undefined
            if (description !== undefined && description.length > 1000) {
                throw new ApplicationError('Course description must be at most 1000 characters', 400)
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

            // Build the new course subdoc. Only set fields that have values
            // so we don't store `present: undefined` etc. — that would
            // round-trip as `null` over JSON.
            const newCourse: Record<string, any> = { name }
            if (certificate) newCourse.certificate = certificate
            if (startDate) newCourse.startDate = startDate
            if (endDate !== undefined) newCourse.endDate = endDate
            if (present !== undefined) newCourse.present = present
            if (description !== undefined) newCourse.description = description

            const updated = await this.userRepo.update({
                filter: { _id: user._id },
                data: { $push: { courses: newCourse } },
                options: { returnDocument: 'after' },
            })

            const newIndex = (updated as any)?.courses?.length
                ? (updated as any).courses.length - 1
                : 0

            const origin = `${req.protocol}://${req.get('host')}`
            return successHandler({
                res,
                status: 201,
                message: 'Course added successfully',
                data: {
                    course: {
                        index: newIndex,
                        name,
                        startDate: startDate ?? null,
                        endDate: endDate !== undefined ? endDate : null,
                        present: present ?? false,
                        description: description ?? null,
                        certificate: certificate ? this.certWithUrl(certificate, origin) : null,
                    },
                },
            })
        } catch (error) {
            next(error)
        }
    }
    /**
     * Remove a course at `courseIndex` from the authenticated user's
     * profile. The associated Cloudinary certificate (if any) is
     * destroyed after the DB delete succeeds, so a failed delete
     * never leaves an orphaned asset reference.
     *
     * Returns 404 when the course doesn't exist.
     */
    deleteCourse = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const { courseIndex } = req.params

            if (typeof courseIndex !== 'string') {
                throw new ApplicationError('Invalid course index', 400)
            }
            const index = Number.parseInt(courseIndex, 10)
            if (!Number.isInteger(index) || index < 0) {
                throw new ApplicationError('Invalid course index', 400)
            }

            const currentUser = await this.userRepo.findById({ id: user._id.toString() })
            if (!currentUser) {
                throw new NotFoundException('User not found')
            }
            const course = currentUser.courses?.[index]
            if (!course) {
                throw new NotFoundException('Course not found')
            }

            // Read certificate info BEFORE the splice — once the array
            // shrinks, `courses.${index}.certificate` no longer points
            // at the right subdoc.
            const certificateToDestroy = course.certificate?.public_id
                ? {
                    public_id: course.certificate.public_id,
                    resourceType: course.certificate.resourceType ?? 'image' as const,
                }
                : null

            // Splice the array at `index` using an aggregation pipeline
            // update (MongoDB 4.2+). `$pull` would remove by predicate
            // (e.g. name) which is unsafe if two courses share a name;
            // the pipeline splice targets the exact slot. Mongoose 9
            // accepts a plain array as the `data` payload for pipeline
            // updates.
            const updated = await this.userRepo.update({
                filter: { _id: user._id },
                data: [
                    {
                        $set: {
                            courses: {
                                $concatArrays: [
                                    { $slice: ['$courses', index] },
                                    {
                                        $slice: [
                                            '$courses',
                                            { $add: [index, 1] },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                ],
                options: { returnDocument: 'after' },
            }) as any

            const removed = (currentUser.courses?.length ?? 0) - ((updated?.courses?.length ?? 0))

            // Bust the cached profile so the next read reflects the change.
            await cacheDel(`user:${user._id.toString()}`)

            // Destroy the Cloudinary asset AFTER the DB change so a
            // failed DB op doesn't orphan-destroy the file.
            if (certificateToDestroy) {
                try {
                    await destroySingleFile(certificateToDestroy.public_id, certificateToDestroy.resourceType)
                } catch (cleanupErr) {
                    // Best-effort: log but don't fail the request. The
                    // user already sees their course gone.
                    console.warn('Failed to destroy course certificate on delete:', cleanupErr)
                }
            }

            return successHandler({
                res,
                message: removed > 0 ? 'Course deleted successfully' : 'Course not found',
                data: { removedCount: removed },
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
            // PDF certificates open through the file-proxy (same as CVs).
            const origin = `${req.protocol}://${req.get('host')}`
            if (Array.isArray(safe.courses)) {
                for (const course of safe.courses) {
                    if (course?.certificate?.resourceType === 'raw' && course.certificate.secure_url) {
                        course.certificate.certificateUrl = buildFileProxyUrl(origin, 'course-certificate.pdf', course.certificate.secure_url)
                    }
                }
            }
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