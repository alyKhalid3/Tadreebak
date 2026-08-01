import { NextFunction, Request, Response } from "express"
import { IUser, UserRoleEnum } from "../DB/types/user.type"
import { InvalidTokenException } from "../utils/error"


/**
 * Role gate. Mounts AFTER `auth()` so that `res.locals.user` is populated.
 *
 * Use this on every endpoint whose behaviour should be restricted to one or
 * more specific roles. C5 in the audit: `auth()` only decodes the token and
 * loads the user — it never checks roles — and most non-admin routes had
 * no AuthZMiddleware, so a STUDENT token could call company-only endpoints
 * and vice versa.
 */
export const AuthZMiddleware = (requiredRoles: UserRoleEnum[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = res.locals.user as IUser | undefined
        if (!user) {
            // auth() was not mounted before this middleware — fail closed
            // instead of crashing on `undefined.role`.
            return next(new InvalidTokenException("Authentication required"))
        }
        if (!requiredRoles.includes(user.role)) {
            return res.status(403).json({ message: "Forbidden" })
        }
        next()
    }
}
