import EventEmitter from "node:events";
import {sendEmail} from "./sendEmail";
type UserEventType='send-email-activation-code'|'send-email-password-reset-code'|'send-email-new-email-code'
export class UserEvents{
    constructor(private emitter: EventEmitter) {}
    subscribe=(event:UserEventType,cb:(payload:any)=>void)=>this.emitter.on(event,cb)
    publish=(event:UserEventType,payload:any)=>this.emitter.emit(event,payload)
}

const emitter=new EventEmitter()
export const emailEmitter=new UserEvents(emitter)

emailEmitter.subscribe('send-email-activation-code',async({to,subject,html}:{to:string,subject:string,html:string})=>{
    await sendEmail({to,subject,html})
})
emailEmitter.subscribe('send-email-password-reset-code',async({to,subject,html}:{to:string,subject:string,html:string})=>{
    await sendEmail({to,subject,html})
})
