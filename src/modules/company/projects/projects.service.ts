import { NextFunction, Request, Response } from "express"
import { Types } from "mongoose"
import { ProjectRepo } from "../../../DB/repos/project.repo"
import { ProjectStatus } from "../../../DB/types/project.type"
import { IAttachment } from "../../../DB/types/attachment.type"
import { ApplicationError, NotFoundException } from "../../../utils/error"
import { successHandler } from "../../../utils/successHandler"
import { assertOwnedCompany } from "../../../utils/companyAccess"
import { cacheDel, cacheFlushPrefix, cacheWrap } from "../../../cache/cache"
import {
    destroySingleFile,
    uploadSingleFile,
} from "../../../utils/multer/cloudinary.service"

const projectRepo = new ProjectRepo()

/**
 * Project CRUD (Phase 1 of the dashboard plan). Pattern matches
 * ProgramsService: company-scoped, ownership-checked, cache-wrapped.
 */
export class ProjectsService {
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const { status, programId, page, limit } = req.query as {
                status?: ProjectStatus
                programId?: string
                page?: number
                limit?: number
            }
            const filter: Record<string, any> = { companyId: new Types.ObjectId(companyId) }
            if (status) filter.status = status
            if (programId) filter.programId = new Types.ObjectId(programId)

            const pageNum = page ?? 1
            const limitNum = limit ?? 20
            const skip = (pageNum - 1) * limitNum

            const cacheKey = `projects:list:${companyId}:${JSON.stringify({ status, programId, pageNum, limitNum })}`
            const { projects, total } = await cacheWrap(cacheKey, 60, async () => {
                const [items, totalCount] = await Promise.all([
                    projectRepo.find({
                        filter,
                        options: { skip, limit: limitNum, sort: { createdAt: -1 } },
                    }),
                    // Proper count (find() doesn't return a count)
                    (await import("../../../DB/models/project.model")).ProjectModel.countDocuments(filter),
                ])
                return { projects: items, total: totalCount }
            })

            return successHandler({
                res,
                message: "Projects fetched successfully",
                data: {
                    projects,
                    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
                },
            })
        } catch (error) {
            next(error)
        }
    }

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const data = req.body as {
                name: string
                description?: string
                programId?: string
                internIds?: string[]
                startDate?: Date
                endDate?: Date | null
                color?: string
            }

            // Optional attachment — multipart `file` field. The
            // multer middleware on the route already streamed and
            // validated mimetype; we just upload to Cloudinary and
            // store the public_id so we can destroy it later.
            // resourceType must match the file: "image" for jpg/png,
            // "raw" for pdf. If create fails after upload, we
            // best-effort destroy the orphan.
            const file = req.file as Express.Multer.File | undefined
            let attachment: IAttachment | undefined
            if (file) {
                const resourceType = file.mimetype.startsWith("image/") ? "image" : "raw"
                const uploaded = await uploadSingleFile({
                    path: file.path,
                    folder: `companies/${companyId}/projects`,
                    resourceType,
                })
                attachment = {
                    public_id: uploaded.public_id,
                    secure_url: uploaded.secure_url,
                    name: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                }
            }

            let project
            try {
                // Build the insert object without setting `undefined`
                // on optional fields — exactOptionalPropertyTypes would
                // reject `description: undefined`. Conditional spread.
                project = await projectRepo.create({
                    data: {
                        name: data.name,
                        ...(data.description !== undefined && { description: data.description }),
                        ...(data.programId && { programId: new Types.ObjectId(data.programId) }),
                        internIds: (data.internIds ?? []).map((id) => new Types.ObjectId(id)),
                        ...(data.startDate && { startDate: data.startDate }),
                        ...(data.endDate !== undefined && { endDate: data.endDate }),
                        ...(data.color && { color: data.color }),
                        ...(attachment && { attachment }),
                        companyId: new Types.ObjectId(companyId),
                        status: ProjectStatus.ACTIVE,
                    },
                })
            } catch (createErr) {
                // Project create failed after we already uploaded
                // the attachment to Cloudinary. Destroy the orphan
                // so we don't leak storage.
                if (attachment) {
                    const resourceType = attachment.mimeType.startsWith("image/")
                        ? "image"
                        : "raw"
                    try {
                        await destroySingleFile(attachment.public_id, resourceType)
                    } catch (cleanupErr) {
                        console.error(
                            "Failed to clean up orphan project attachment:",
                            cleanupErr,
                        )
                    }
                }
                throw createErr
            }

            await cacheFlushPrefix(`projects:${companyId}`)

            return successHandler({
                res,
                message: "Project created successfully",
                status: 201,
                data: { project },
            })
        } catch (error) {
            next(error)
        }
    }

    detail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const projectId = req.params.projectId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const cacheKey = `projects:detail:${projectId}`
            const project = await cacheWrap(cacheKey, 60, async () => {
                return projectRepo.findOne({ filter: { _id: projectId, companyId } })
            })
            if (!project) throw new NotFoundException("Project not found")

            return successHandler({
                res,
                message: "Project fetched successfully",
                data: { project },
            })
        } catch (error) {
            next(error)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const projectId = req.params.projectId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const existing = await projectRepo.findOne({ filter: { _id: projectId, companyId } })
            if (!existing) throw new NotFoundException("Project not found")

            const updated = await projectRepo.update({
                filter: { _id: projectId, companyId },
                data: { ...req.body },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`projects:detail:${projectId}`),
                cacheFlushPrefix(`projects:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Project updated successfully",
                data: { project: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Soft delete: status → 'archived'. Reversible. Keeps task/evaluation
     * references intact for the dashboard's historical view.
     */
    archive = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const projectId = req.params.projectId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const existing = await projectRepo.findOne({ filter: { _id: projectId, companyId } })
            if (!existing) throw new NotFoundException("Project not found")

            await projectRepo.update({
                filter: { _id: projectId, companyId },
                data: { status: ProjectStatus.ARCHIVED },
            })

            await Promise.all([
                cacheDel(`projects:detail:${projectId}`),
                cacheFlushPrefix(`projects:list:${companyId}`),
            ])

            return successHandler({ res, message: "Project archived successfully" })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Assign interns to a project. The interns should already be
     * enrolled at the company (have `enrollmentCompanyId` set); the
     * project just tracks which of them work on it.
     */
    assignInterns = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const projectId = req.params.projectId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const { internIds } = req.body as { internIds: string[] }
            const project = await projectRepo.findOne({ filter: { _id: projectId, companyId } })
            if (!project) throw new NotFoundException("Project not found")

            const updated = await projectRepo.update({
                filter: { _id: projectId, companyId },
                data: { $addToSet: { internIds: { $each: internIds.map((id) => new Types.ObjectId(id)) } } },
                options: { returnDocument: "after" },
            })

            await Promise.all([
                cacheDel(`projects:detail:${projectId}`),
                cacheFlushPrefix(`projects:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Interns assigned to project",
                data: { project: updated },
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Replace the project's attachment (the "explanation"). The old
     * Cloudinary file is destroyed (best-effort) and a new one is
     * uploaded. The route is multipart with a single `file` field;
     * omitting the field returns 400.
     */
    replaceAttachment = async (
        req: Request,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const companyId = req.params.companyId as string
            const projectId = req.params.projectId as string
            const user = res.locals.user
            await assertOwnedCompany(companyId, user._id.toString())

            const file = req.file as Express.Multer.File | undefined
            if (!file) {
                throw new ApplicationError(
                    "No file uploaded. Send a `file` field with the new attachment.",
                    400,
                )
            }

            // Find the project + capture the OLD attachment (if any)
            // so we can destroy it after the new one uploads. We do
            // the find before the upload so a missing project surfaces
            // a 404 instead of leaking a Cloudinary orphan.
            const project = await projectRepo.findOne({
                filter: { _id: projectId, companyId },
            })
            if (!project) throw new NotFoundException("Project not found")
            const oldAttachment = project.attachment

            // Upload the new file. If THIS fails we still hold the
            // old file (good — we don't touch it).
            const resourceType = file.mimetype.startsWith("image/") ? "image" : "raw"
            const uploaded = await uploadSingleFile({
                path: file.path,
                folder: `companies/${companyId}/projects`,
                resourceType,
            })
            const newAttachment: IAttachment = {
                public_id: uploaded.public_id,
                secure_url: uploaded.secure_url,
                name: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
            }

            // Persist the swap. If this fails we must destroy the
            // brand-new file (the old one is still alive).
            let updated
            try {
                updated = await projectRepo.update({
                    filter: { _id: projectId, companyId },
                    data: { attachment: newAttachment },
                    options: { returnDocument: "after" },
                })
            } catch (updateErr) {
                try {
                    await destroySingleFile(newAttachment.public_id, resourceType)
                } catch (cleanupErr) {
                    console.error(
                        "Failed to clean up orphan project attachment:",
                        cleanupErr,
                    )
                }
                throw updateErr
            }

            // Update succeeded — now best-effort destroy the old
            // Cloudinary file. We don't roll back the swap if this
            // fails; the old file becomes a janitorial concern (a
            // future cleanup sweep can pick it up).
            if (oldAttachment?.public_id) {
                const oldResourceType = oldAttachment.mimeType.startsWith("image/")
                    ? "image"
                    : "raw"
                try {
                    await destroySingleFile(oldAttachment.public_id, oldResourceType)
                } catch (err) {
                    console.error(
                        "Failed to delete old project attachment from Cloudinary:",
                        err,
                    )
                }
            }

            await Promise.all([
                cacheDel(`projects:detail:${projectId}`),
                cacheFlushPrefix(`projects:list:${companyId}`),
            ])

            return successHandler({
                res,
                message: "Project attachment updated successfully",
                data: { project: updated },
            })
        } catch (error) {
            next(error)
        }
    }
}
