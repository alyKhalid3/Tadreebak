import { notificationEmitter } from "./notificationEvents";
import { NotificationRepo } from "../../DB/repos/notification.repo";
import { NotificationType, INotification } from "../../DB/types/notification.type";
import mongoose from "mongoose";
import { RatingTarget } from "../../DB/types/rating.type";
import { companyModel } from "../../DB/models/company.model";

// Single repo instance reused by all subscribers.
const repo = new NotificationRepo()

// Build a human-readable title + message for each event type from the payload.
// `data` always carries the ids the client needs for deep-linking.
const buildContent = (
    type: NotificationType,
    data: Record<string, any> = {},
): { title: string, message: string } => {
    const companyName = data.companyName ? `"${data.companyName}"` : 'Your company'
    const internshipTitle = data.internshipTitle ? `"${data.internshipTitle}"` : 'an internship'

    switch (type) {
        case NotificationType.APPLICATION_SUBMITTED:
            return {
                title: 'New application',
                message: `${data.studentName ?? 'A student'} applied to ${internshipTitle}.`,
            }
        case NotificationType.APPLICATION_REVIEWED: {
            const outcome = data.status === 'accepted' ? 'accepted' : 'rejected'
            return {
                title: `Application ${outcome}`,
                message: `Your application to ${internshipTitle} was ${outcome}.`,
            }
        }
        case NotificationType.APPLICATION_CANCELLED:
            return {
                title: 'Application withdrawn',
                message: `${data.studentName ?? 'A student'} withdrew their application to ${internshipTitle}.`,
            }
        case NotificationType.COMPANY_APPROVED:
            return {
                title: 'Company approved',
                message: `${companyName} has been approved. You can now post internships.`,
            }
        case NotificationType.COMPANY_BANNED:
            return {
                title: 'Company banned',
                message: `${companyName} has been banned by an administrator.`,
            }
        case NotificationType.COMPANY_UNBANNED:
            return {
                title: 'Company reinstated',
                message: `${companyName} is no longer banned.`,
            }
        case NotificationType.RATING_RECEIVED:
            return {
                title: 'New Rating Received',
                message: 'You received a new rating for your recent internship activity.',
            }
        case NotificationType.INTERN_MATCH_POSTED:
            return {
                title: 'New internship match',
                message: `${data.companyName ? `${data.companyName} posted ` : 'A new '}internship${data.track ? ` for ${data.track}` : ''}${data.internshipTitle ? `: ${data.internshipTitle}` : ''}.`,
            }
    }
}

// Persist a notification. Wrapped so a DB failure never rejects the publisher
// (services publish synchronously and don't await the bus).
const handle = async (
    type: NotificationType,
    payload: { recipient?: string, targetType?: RatingTarget, targetId?: string, data?: Record<string, any> },
) => {
    try {
        const recipient = payload.recipient ?? await resolveRecipient(payload.targetType, payload.targetId)
        if (!recipient) {
            console.warn(`Skipping notification ${type}: recipient could not be resolved`)
            return
        }
        const { title, message } = buildContent(type, payload.data)
        const doc: Partial<INotification> = {
            recipient: new mongoose.Types.ObjectId(recipient),
            type,
            title,
            message,
            read: false,
        }
        // Only attach `data` when present — INotification.data is optional and
        // exactOptionalPropertyTypes forbids assigning `undefined` to it.
        if (payload.data) {
            doc.data = payload.data
        }
        await repo.create({
            data: doc,
        })
    } catch (err) {
        console.error(`Failed to persist notification (${type}):`, err)
    }
}

const resolveRecipient = async (targetType?: RatingTarget, targetId?: string): Promise<string | undefined> => {
    if (!targetType || !targetId) {
        return undefined
    }

    if (targetType === RatingTarget.STUDENT) {
        return targetId
    }

    const company = await companyModel.findById(targetId).select("createdBy")
    if (!company) {
        console.warn(`Skipping notification resolution for missing company ${targetId}`)
        return undefined
    }

    return company.createdBy?.toString()
}

// Subscribe to every notification type. Importing this module is enough to
// register the listeners — it's a side-effect import from the app entrypoint.
(Object.values(NotificationType) as NotificationType[]).forEach((type) => {
    notificationEmitter.subscribe(type, (payload) => {
        void handle(type, payload)
    })
})
