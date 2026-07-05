import { NextFunction, Request, Response } from "express";
import mongoose, { isObjectIdOrHexString } from "mongoose";
import { NotificationRepo } from "../../DB/repos/notification.repo";
import { NotificationModel } from "../../DB/models/notification.model";
import { ApplicationError, NotFoundException } from "../../utils/error";
import { successHandler } from "../../utils/successHandler";

export class NotificationService {
    private notificationRepo = new NotificationRepo()

    // GET /  — list the authenticated user's notifications (paginated)
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const { unreadOnly, page = "1", limit = "10" } = req.query as Record<string, string | undefined>

            const filter: Record<string, any> = { recipient: user._id }
            if (unreadOnly === "true") filter.read = false

            const pageNum = Math.max(1, parseInt(page || "1", 10))
            const limitNum = Math.min(50, Math.max(1, parseInt(limit || "10", 10)))
            const skip = (pageNum - 1) * limitNum

            const [notifications, total] = await Promise.all([
                this.notificationRepo.find({
                    filter,
                    options: { skip, limit: limitNum, sort: { createdAt: -1 } },
                }),
                NotificationModel.countDocuments(filter),
            ])

            return successHandler({
                res,
                message: "Notifications fetched successfully",
                data: {
                    notifications,
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

    // GET /unread-count  — cheap count for the bell badge
    unreadCount = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const count = await NotificationModel.countDocuments({
                recipient: user._id,
                read: false,
            })
            return successHandler({ res, message: "Unread count", data: { count } })
        } catch (error) {
            next(error)
        }
    }

    // PATCH /:id/read  — mark one as read
    markRead = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params
            const user = res.locals.user
            if (!isObjectIdOrHexString(id)) {
                throw new ApplicationError("Invalid notification id", 400)
            }
            const updated = await this.notificationRepo.update({
                filter: { _id: new mongoose.Types.ObjectId(id as string), recipient: user._id },
                data: { read: true },
                options: { returnDocument: "after" },
            })
            if (!updated) {
                throw new NotFoundException("Notification not found")
            }
            return successHandler({ res, message: "Notification marked as read", data: { notification: updated } })
        } catch (error) {
            next(error)
        }
    }

    // PATCH /read-all  — mark all of mine as read (single round-trip)
    markAllRead = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = res.locals.user
            const unreadIds = await NotificationModel.distinct('_id', { recipient: user._id, read: false }) as string[]
            const modifiedCount = await this.notificationRepo.markManyRead({
                ids: unreadIds,
                recipientId: user._id.toString(),
            })
            return successHandler({ res, message: "All notifications marked as read", data: { modifiedCount } })
        } catch (error) {
            next(error)
        }
    }
}
