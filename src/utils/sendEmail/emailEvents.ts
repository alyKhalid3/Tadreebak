import EventEmitter from "node:events";
import { sendEmail } from "./sendEmail";
type UserEventType = 'send-email-activation-code' | 'send-email-password-reset-code' | 'send-email-new-email-code'
export class UserEvents {
    constructor(private emitter: EventEmitter) { }
    subscribe = (event: UserEventType, cb: (payload: any) => void) => this.emitter.on(event, cb)
    publish = (event: UserEventType, payload: any) => this.emitter.emit(event, payload)
}

const emitter = new EventEmitter()
export const emailEmitter = new UserEvents(emitter)

// Bug 7: the listeners are async, but a sync EventEmitter does not await them,
// so a rejected sendEmail() became an unhandled rejection. Wrap each handler so
// failures are logged instead of crashing the process.
const handleEmail = async ({ to, subject, html }: { to: string, subject: string, html: string }) => {
    try {
        await sendEmail({ to, subject, html })
    } catch (err) {
        console.error(`Failed to send email to ${to}:`, err)
    }
}

emailEmitter.subscribe('send-email-activation-code', handleEmail)
emailEmitter.subscribe('send-email-password-reset-code', handleEmail)
emailEmitter.subscribe('send-email-new-email-code', handleEmail)
