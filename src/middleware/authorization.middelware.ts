import { NextFunction, Request, Response } from "express"
import { IUser, UserRoleEnum } from "../DB/types/user.type"


export const AuthZMiddleware = (requiredRoles: UserRoleEnum[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = res.locals.user as IUser
        if (!requiredRoles.includes(user.role)) {
            return res.status(403).json({ message: "Forbidden" })
        }
        next()
    }
}
