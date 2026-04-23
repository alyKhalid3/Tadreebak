import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { payload } from "../middleware/auth.middelware";




export const createJwt=(payload:object|string,secret:Secret,options?:SignOptions):string=>{
    const token=jwt.sign(payload,secret,options)
    return token
}

export const verifyJwt=(token:string,secret:Secret):payload=>{
    const decoded=jwt.verify(token,secret)
    return decoded as payload
}