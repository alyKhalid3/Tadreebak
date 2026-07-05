import EventEmitter from "node:events";
import { NotificationType } from "../../DB/types/notification.type";

// Payload every trigger must provide. `recipient` is the user the notification
// is for; `data` is optional context for client deep-linking/messaging.
export interface NotificationPayload {
    recipient: string
    data?: Record<string, any>
}

type NotificationEvent = `${NotificationType}`

export class NotificationBus {
    constructor(private emitter: EventEmitter) { }
    publish = (event: NotificationEvent, payload: NotificationPayload) => this.emitter.emit(event, payload)
    subscribe = (event: NotificationEvent, cb: (payload: NotificationPayload) => void) => this.emitter.on(event, cb)
}

const emitter = new EventEmitter()
export const notificationEmitter = new NotificationBus(emitter)
