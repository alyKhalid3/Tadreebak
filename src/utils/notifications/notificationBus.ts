import { notificationEmitter } from "./notificationEvents";
import { NotificationRepo } from "../../DB/repos/notification.repo";
import { NotificationType, INotification } from "../../DB/types/notification.type";
import mongoose from "mongoose";

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
    }
}

// Persist a notification. Wrapped so a DB failure never rejects the publisher
// (services publish synchronously and don't await the bus).
const handle = async (type: NotificationType, { recipient, data }: { recipient: string, data?: Record<string, any> }) => {
    try {
        const { title, message } = buildContent(type, data)
        const doc: Partial<INotification> = {
            recipient: new mongoose.Types.ObjectId(recipient),
            type,
            title,
            message,
            read: false,
        }
        // Only attach `data` when present — INotification.data is optional and
        // exactOptionalPropertyTypes forbids assigning `undefined` to it.
        if (data) {
            doc.data = data
        }
        await repo.create({
            data: doc,
        })
    } catch (err) {
        console.error(`Failed to persist notification (${type}) for ${recipient}:`, err)
    }
}

// Subscribe to every notification type. Importing this module is enough to
// register the listeners — it's a side-effect import from the app entrypoint.
(Object.values(NotificationType) as NotificationType[]).forEach((type) => {
    notificationEmitter.subscribe(type, (payload) => {
        void handle(type, payload)
    })
})
