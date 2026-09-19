import { NextFunction, Request, Response } from "express";
import mongoose, { isObjectIdOrHexString } from "mongoose";
import { ApplicationRepo } from "../../DB/repos/application.repo";
import { InternRepo } from "../../DB/repos/intern.repo";
import { UserRepo } from "../../DB/repos/user.repo";
import { ApplicationModel } from "../../DB/models/application.model";
import { ApplicationStatus, IApplication } from "../../DB/types/application.type";
import { IInternShip } from "../../DB/types/internship.type";
import { IAnswer, IQuestion, QuestionType } from "../../DB/types/question.type";
import { ApplicationError, NotFoundException } from "../../utils/error";
import { successHandler } from "../../utils/successHandler";
import { assertOwnedCompany } from "../../utils/companyAccess";
import { uploadSingleFile, destroySingleFile } from "../../utils/multer/cloudinary.service";
import { notificationEmitter } from "../../utils/notifications/notificationEvents";
import { NotificationType } from "../../DB/types/notification.type";
import { emailEmitter } from "../../utils/sendEmail/emailEvents";
import { acceptanceTemplate } from "../../utils/sendEmail/generateHtml";
import { CompanyRepo } from "../../DB/repos/company.repo";
import { RatingModel } from "../../DB/models/rating.model";
import { RatingFrom, RatingTarget } from "../../DB/types/rating.type";
import { companyModel } from "../../DB/models/company.model";
import { UserModel } from "../../DB/models/user.model";
import { UserRoleEnum } from "../../DB/types/user.type";
import { cacheDel, cacheFlushPrefix } from "../../cache/cache";

export class ApplicationService {
    private applicationRepo = new ApplicationRepo()
    private internRepo = new InternRepo()
    private userRepo = new UserRepo()
    private companyRepo = new CompanyRepo()

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
            const { coverLetter, answers: rawAnswers } = req.body as { coverLetter?: string, answers?: any[] }
            const user = res.locals.user

            const internship = await this.getInternshipForApply(internId, companyId)
            // The company owner cannot apply to their own internship.
            if (internship.addedBy.toString() === user._id.toString()) {
                throw new ApplicationError("You cannot apply to your own internship", 400)
            }

            // Validate answers against the internship's questions (if any) and
            // snapshot each question alongside the response so the company
            // always sees what was asked even if the internship is later edited.
            const questions = internship.questions ?? []
            let snapshotAnswers: IAnswer[] = []
            if (questions.length > 0) {
                const answers = rawAnswers ?? []
                if (answers.length !== questions.length) {
                    throw new ApplicationError("You must answer all internship questions", 400)
                }
                snapshotAnswers = questions.map((question: IQuestion, i: number) => {
                    const answer = answers[i]
                    if (question.type === QuestionType.MCQ) {
                        if (answer.type !== 'mcq') {
                            throw new ApplicationError(`Question ${i + 1} requires an MCQ answer`, 400)
                        }
                        if (!question.options.includes(answer.selectedOption)) {
                            throw new ApplicationError(`Answer for question ${i + 1} is not a valid option`, 400)
                        }
                        return {
                            type: QuestionType.MCQ,
                            prompt: question.prompt,
                            options: question.options,
                            selectedOption: answer.selectedOption,
                        }
                    }
                    if (answer.type !== 'writing') {
                        throw new ApplicationError(`Question ${i + 1} requires a writing answer`, 400)
                    }
                    return {
                        type: QuestionType.WRITING,
                        prompt: question.prompt,
                        text: answer.text,
                    }
                })
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

            // Students must have education on their profile before they can apply.
            if (!applicant.education || applicant.education.length === 0) {
                throw new ApplicationError("Please add your education details to your profile before applying", 400)
            }

            if (uploadedFile) {
                const uploaded = await uploadSingleFile({
                    path: uploadedFile.path,
                    folder: `/users/${applicant.firstName}_${applicant._id}/applications`,
                    resourceType: "raw",
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
                answers: snapshotAnswers,
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
                    // H4: if the user just uploaded a fresh CV, delete it
                    // from Cloudinary — otherwise it lives forever as an
                    // orphan (and we still have the user's profile resume).
                    if (uploadedFile && resume?.public_id) {
                        try {
                            await destroySingleFile(resume.public_id, "raw")
                        } catch (cleanupErr) {
                            console.error("Failed to clean up orphan CV on duplicate apply:", cleanupErr)
                        }
                    }
                    throw new ApplicationError("You have already applied to this internship", 409)
                }
                throw err
            }

            // Notify the company owner that a new application came in.
            notificationEmitter.publish(NotificationType.APPLICATION_SUBMITTED, {
                recipient: internship.addedBy.toString(),
                data: {
                    applicationId: (application as any)._id.toString(),
                    internshipId: internId,
                    internshipTitle: internship.title,
                    studentName: `${applicant.firstName} ${applicant.lastName}`,
                },
            })

            // Phase 11 / P2 #E1: a new application shifts the
            // `applicantsCount` projected onto every list response.
            // Bust the list cache so the next read picks up the new
            // count and the company's own page no longer shows stale
            // "0 applicants".
            await cacheFlushPrefix('internships:list')
            await cacheDel(`internships:detail:${internId}`)

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

            // Fetch context (internship owner + title, student name) before we
            // delete the row, so the notification is descriptive.
            const internship = await this.internRepo.findById({ id: application.internshipId.toString() })
            const student = await this.userRepo.findById({ id: user._id.toString() })

            await this.applicationRepo.deleteMany({ filter: { _id: new mongoose.Types.ObjectId(applicationId as string) } })

            // Notify the company owner that the student withdrew.
            if (internship) {
                notificationEmitter.publish(NotificationType.APPLICATION_CANCELLED, {
                    recipient: internship.addedBy.toString(),
                    data: {
                        applicationId: applicationId as string,
                        internshipId: application.internshipId.toString(),
                        internshipTitle: internship.title,
                        studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
                    },
                })
            }

            // Phase 11 / P2 #E1: a withdrawn application shifts the
            // `applicantsCount` projected onto every list response.
            await cacheFlushPrefix('internships:list')
            await cacheDel(`internships:detail:${application.internshipId.toString()}`)

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

            // Phase 5: when an application is accepted, append a new
            // active enrollment to user.enrollments[]. The user can be
            // enrolled at multiple companies — the legacy single-
            // company fields are no longer the source of truth.
            //
            // Block: same-company re-accept of an already-active
            // enrollment. The intern has to withdraw / complete the
            // current one before being re-accepted. Re-accept after
            // a withdrawn/completed enrollment is fine (per the
            // design decision: re-accept allowed).
            if (status === ApplicationStatus.ACCEPTED) {
                const targetUser = await UserModel.findOne(
                    { _id: application.studentId },
                    { enrollments: 1, firstName: 1, lastName: 1 },
                ).lean()
                const existing = (targetUser?.enrollments ?? []).find(
                    (e) =>
                        e.companyId.toString() === companyId &&
                        e.status === "active",
                )
                if (existing) {
                    throw new ApplicationError(
                        `${targetUser?.firstName ?? ""} ${targetUser?.lastName ?? ""} is already an active intern at this company`,
                        409,
                    )
                }

                const now = new Date()
                const newEnrollment = {
                    _id: new mongoose.Types.ObjectId(),
                    companyId: new mongoose.Types.ObjectId(companyId),
                    status: "active",
                    enrolledAt: now,
                    internshipStartDate: now,
                    internshipEndDate: null,
                    totalPoints: 0,
                }
                // Promote role on first accept; subsequent accepts
                // (the user is already an intern elsewhere) are no-ops
                // for the role.
                await UserModel.updateOne(
                    { _id: application.studentId },
                    {
                        // First enrollment ever → set role to INTERN
                        // AND push the new entry. Existing enrollments
                        // → only push (don't touch role or the legacy
                        // single-company fields).
                        $set: {
                            ...(!(targetUser?.enrollments && targetUser.enrollments.length > 0)
                                ? { role: UserRoleEnum.INTERN }
                                : {}),
                        },
                        $push: { enrollments: newEnrollment },
                    },
                )

                // Bust caches: the per-company roster, the user's
                // profile cache, the intern-side picker
                // (`intern:enrollments:{userId}`), AND the per-company
                // intern-side view (`intern:me:{userId}:...` prefix).
                // The picker key starts with `intern:enrollments:` so
                // the prefix-flush on `intern:me:` below does NOT
                // cover it — flush it explicitly.
                await cacheFlushPrefix(`interns:list:${companyId}`)
                await cacheDel(`user:${application.studentId.toString()}`)
                await cacheDel(`intern:enrollments:${application.studentId.toString()}`)
                await cacheFlushPrefix(`intern:me:${application.studentId.toString()}`)
            }

            // Notify the student of the decision. Fetch the internship title so
            // the message is descriptive (cheap single read, already on the
            // hot path of the ownership check).
            const internship = await this.internRepo.findById({ id: internId })
            notificationEmitter.publish(NotificationType.APPLICATION_REVIEWED, {
                recipient: application.studentId.toString(),
                data: {
                    applicationId: applicationId as string,
                    internshipId: internId,
                    internshipTitle: internship?.title,
                    status,
                },
            })

            return successHandler({ res, message: `Application ${status}`, data: { application: updated } })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: send acceptance email (manual trigger) ----
    sendAcceptanceEmail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const internId = req.params.internId as string
            const { applicationId } = req.params
            const user = res.locals.user

            const company = await assertOwnedCompany(companyId, user._id.toString())

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
            if (application.status !== ApplicationStatus.ACCEPTED) {
                throw new ApplicationError("Can only send an acceptance email for an accepted application", 400)
            }

            const internship = await this.internRepo.findById({ id: internId })
            if (!internship) {
                throw new NotFoundException("Internship not found")
            }
            // C11: also confirm the internship actually belongs to the company
            // named in the URL. Without this a company owner could pass any
            // applicationId from any other company's internship and trigger an
            // email to the applicant that misuses the attacker's company name.
            if (internship.companyId.toString() !== companyId) {
                throw new NotFoundException("Internship not found")
            }

            const student = await this.userRepo.findById({ id: application.studentId.toString() })
            if (!student) {
                throw new NotFoundException("Student not found")
            }

            const preKnowledge = internship.preKnowledge ?? []
            const studentName = student.firstName
            const subject = `Congratulations! You've been accepted for ${internship.title}`
            // Optional personal note from the company. exactOptionalPropertyTypes
            // forbids assigning `undefined`, so only set it when present.
            const message = typeof (req.body as Record<string, any>)?.message === 'string'
                ? (req.body as Record<string, any>).message.trim()
                : undefined
            const tmplArgs: Parameters<typeof acceptanceTemplate>[0] = {
                studentName,
                internshipTitle: internship.title,
                companyName: company.name,
                preKnowledge,
                subject,
            }
            if (message) tmplArgs.message = message
            const html = acceptanceTemplate(tmplArgs)

            emailEmitter.publish('send-email-acceptance', {
                to: student.email,
                subject,
                html,
            })

            return successHandler({ res, message: "Acceptance email sent successfully" })
        } catch (error) {
            next(error)
        }
    }

    // ---- Company: mark an accepted application as completed ----
    markCompleted = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const internId = req.params.internId as string
            const { applicationId } = req.params
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
            if (application.status !== ApplicationStatus.ACCEPTED) {
                throw new ApplicationError("Can only mark accepted applications as completed", 400)
            }
            if (application.completed) {
                throw new ApplicationError("Application is already marked as completed", 400)
            }

            const updated = await this.applicationRepo.update({
                filter: { _id: new mongoose.Types.ObjectId(applicationId as string) },
                data: { completed: true, completedAt: new Date() },
                options: { returnDocument: "after" },
            })

            return successHandler({ res, message: "Application marked as completed", data: { application: updated } })
        } catch (error) {
            next(error)
        }
    }

    rate = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { applicationId } = req.params
            const { score, comment } = req.body as { score: number, comment?: string }
            const user = res.locals.user

            if (!isObjectIdOrHexString(applicationId)) {
                throw new ApplicationError("Invalid application id", 400)
            }

            const application = await ApplicationModel.findById(applicationId as string).populate<{ internshipId: IInternShip & { _id: any } }>('internshipId')
            if (!application) {
                throw new NotFoundException("Application not found")
            }
            const internship = application.internshipId as any
            if (!internship) {
                throw new NotFoundException("Internship not found")
            }

            if (application.status !== ApplicationStatus.ACCEPTED || !application.completed) {
                throw new ApplicationError("Application must be completed before rating", 400)
            }

            let from: RatingFrom
            let targetType: RatingTarget
            let targetId: mongoose.Types.ObjectId

            if (user._id.toString() === application.studentId.toString()) {
                from = RatingFrom.STUDENT
                targetType = RatingTarget.COMPANY
                targetId = internship.companyId
            } else if (user._id.toString() === internship.addedBy.toString()) {
                from = RatingFrom.COMPANY
                targetType = RatingTarget.STUDENT
                targetId = application.studentId
            } else {
                throw new ApplicationError("Not authorized to rate this application", 403)
            }

            const existing = await RatingModel.findOne({ applicationId: application._id, from })
            if (existing) {
                throw new ApplicationError("You have already rated this application", 409)
            }

            const session = await mongoose.startSession()
            try {
                session.startTransaction()

                const ratingDoc: Record<string, any> = {
                    applicationId: application._id,
                    from,
                    raterId: user._id,
                    targetType,
                    targetId,
                    score,
                }
                if (comment) {
                    ratingDoc.comment = comment
                }
                const rating = await new RatingModel(ratingDoc).save({ session })

                // H1: previously we did a read-modify-write on (avgRating,
                // ratingCount) inside the transaction. Two concurrent ratings
                // would both read the same old avg, compute the same new avg,
                // and write it back — drifting the average away from the
                // true mean. Now we just $inc the count and $push the score
                // onto a `ratingSum` field; the average is recomputed on
                // read by the service that exposes it.
                if (targetType === RatingTarget.COMPANY) {
                    await companyModel.findByIdAndUpdate(targetId, {
                        $inc: { ratingCount: 1, ratingSum: score },
                    }, { session })
                } else {
                    await UserModel.findByIdAndUpdate(targetId, {
                        $inc: { ratingCount: 1, ratingSum: score },
                    }, { session })
                }

                await session.commitTransaction()

                // Bust the cached company-ratings aggregation so the
                // company page sees the new vote within one request.
                // Key matches `cacheWrap` in company.service.getCompanyRatings.
                if (targetType === RatingTarget.COMPANY) {
                    await cacheDel(`company:ratings:${targetId.toString()}`)
                }

                notificationEmitter.publish(NotificationType.RATING_RECEIVED, {
                    targetType,
                    targetId: targetId.toString(),
                    data: { applicationId: applicationId as string, from: from.toString() },
                })

                return successHandler({ res, message: "Rating submitted successfully", data: { rating }, status: 201 })
            } catch (err: any) {
                if (err && err.code === 11000) {
                    throw new ApplicationError("You have already rated this application", 409)
                }
                try {
                    if (session.inTransaction()) {
                        await session.abortTransaction()
                    }
                } catch (abortError) {
                    console.error("Failed to abort rating transaction:", abortError)
                }
                throw err
            } finally {
                session.endSession()
            }
        } catch (error) {
            next(error)
        }
    }

    getRatings = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { applicationId } = req.params
            const user = res.locals.user

            if (!isObjectIdOrHexString(applicationId)) {
                throw new ApplicationError("Invalid application id", 400)
            }

            const application = await ApplicationModel.findById(applicationId as string).populate<{ internshipId: IInternShip & { _id: any } }>('internshipId')
            if (!application) {
                throw new NotFoundException("Application not found")
            }
            const internship = application.internshipId as any
            if (!internship) {
                throw new NotFoundException("Internship not found")
            }

            const isStudent = user._id.toString() === application.studentId.toString()
            const isCompanyOwner = user._id.toString() === internship.addedBy.toString()
            if (!isStudent && !isCompanyOwner) {
                throw new ApplicationError("Not authorized to view ratings for this application", 403)
            }

            const [studentRating, companyRating] = await Promise.all([
                RatingModel.findOne({ applicationId: application._id, from: RatingFrom.STUDENT }),
                RatingModel.findOne({ applicationId: application._id, from: RatingFrom.COMPANY }),
            ])

            const bothSubmitted = !!studentRating && !!companyRating
            const revealTimeoutPassed = application.completedAt
                ? (Date.now() - new Date(application.completedAt).getTime()) >= 14 * 24 * 60 * 60 * 1000
                : false
            const visible = bothSubmitted || revealTimeoutPassed

            const studentRatingDTO = studentRating
                ? visible
                    ? { score: studentRating.score, comment: studentRating.comment, createdAt: studentRating.createdAt }
                    : { submitted: true }
                : null

            const companyRatingDTO = companyRating
                ? visible
                    ? { score: companyRating.score, comment: companyRating.comment, createdAt: companyRating.createdAt }
                    : { submitted: true }
                : null

            return successHandler({
                res,
                data: {
                    studentRating: studentRatingDTO,
                    companyRating: companyRatingDTO,
                    bothSubmitted,
                },
            })
        } catch (error) {
            next(error)
        }
    }
}
