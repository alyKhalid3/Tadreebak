import EventEmitter from "node:events";
import { NotificationType } from "../../DB/types/notification.type";
import { RatingTarget } from "../../DB/types/rating.type";

// Payload every trigger may provide. Most events pass `recipient` directly;
// rating events pass `targetType` and `targetId` so the bus can resolve the
// actual user recipient without coupling the service to notification routing.
export interface NotificationPayload {
    recipient?: string
    targetType?: RatingTarget
    targetId?: string
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
