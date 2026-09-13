import { NextFunction, Request, Response } from "express"
import { IUser, UserRoleEnum } from "../DB/types/user.type"
import { InvalidTokenException } from "../utils/error"
import { hasAnyActiveEnrollment } from "../utils/enrollment"


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

/**
 * Intern gate (Phase 3, updated Phase 5). Same shape as AuthZMiddleware
 * but accepts a user who has either the `INTERN` role OR at least one
 * active enrollment. The `enrollments` fallback is the important one:
 * when an application is accepted, the user's `role` flips to INTERN
 * and a new active enrollment is added, but their existing JWT was
 * signed with the old role (`STUDENT`). The /auth/refresh handshake
 * fixes the token eventually, but for the few minutes between accept
 * and refresh, we still want intern endpoints to work — so we trust
 * the DB-side `enrollments[]` as the source of truth.
 *
 * Mount AFTER `auth()`. Returns 403 with a friendly message rather than
 * the generic `Forbidden`, so the frontend can show "you are not an
 * intern at any company" instead of a generic error.
 */
export const requireIntern = () => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = res.locals.user as IUser | undefined
        if (!user) {
            return next(new InvalidTokenException("Authentication required"))
        }
        const isIntern =
            user.role === UserRoleEnum.INTERN || hasAnyActiveEnrollment(user)
        if (!isIntern) {
            return res.status(403).json({
                message: "Intern access only. Apply and be accepted to use this endpoint.",
            })
        }
        next()
    }
}
