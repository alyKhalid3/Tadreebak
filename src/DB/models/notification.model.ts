import mongoose from "mongoose";
import { INotification, NotificationType } from "../types/notification.type";



export const notificationSchema = new mongoose.Schema<INotification>({
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NotificationType, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Object },
    read: { type: Boolean, default: false, required: true },
}, { timestamps: true });

// Compound index to keep the recipient's unread/list queries fast without
// a separate collection scan: { recipient } + { read } + newest-first.
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export const NotificationModel = mongoose.model<INotification>('Notification', notificationSchema);
