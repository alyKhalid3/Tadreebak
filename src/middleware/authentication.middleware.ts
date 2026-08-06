import { NextFunction, Request, Response } from "express";
import { UserModel } from "../DB/models/user.model";
import { UserRepo } from "../DB/repos/user.repo";
import { ApplicationError, InvalidTokenException, NotConfirmedException, NotFoundException } from "../utils/error";
import { verifyJwt } from "../utils/jwt";
import jsonwebtoken from "jsonwebtoken";
import { cacheWrap } from "../cache/cache";

export enum tokenTypeEnum {
    ACCESS = 'access',
    REFRESH = 'refresh'
}

export interface payload {
    jti: string;
    id: string
    iat: number;
    exp: number;

}

const userRepo = new UserRepo(UserModel);
export const decodeToken = async ({ authorization, tokenType = tokenTypeEnum.ACCESS }: { authorization?: string, tokenType?: tokenTypeEnum }) => {
    const bearer = process.env.BEARER
    if (!bearer) {
        throw new InvalidTokenException("Invalid token");
    }
    if (!authorization) {
        throw new InvalidTokenException("Invalid token");
    }
    if (!authorization.startsWith(bearer)) {
        throw new InvalidTokenException("Invalid token");
    }

    const token = authorization.split(" ")[1]
    if (!token) {
        throw new InvalidTokenException("Invalid token");
    }
    let payload: payload
    try {
        payload = verifyJwt(token,
            tokenType === tokenTypeEnum.ACCESS ?
                process.env.ACCESS_TOKEN_SECRET as string
                : process.env.REFRESH_TOKEN_SECRET as string
        )
    } catch (err) {
        // Normalize jsonwebtoken errors (no statusCode) into InvalidTokenException.
        // Read the classes off the default export — jsonwebtoken is CJS, so named
        // value imports (JsonWebTokenError, TokenExpiredError) don't work under ESM.
        if (err instanceof jsonwebtoken.TokenExpiredError) {
            throw new InvalidTokenException("Token expired")
        }
        if (err instanceof jsonwebtoken.JsonWebTokenError) {
            throw new InvalidTokenException("Invalid token")
        }
        throw new InvalidTokenException("Invalid token")
    }
    if (!payload.iat || !payload.id) {
        throw new InvalidTokenException("Invalid token payload");
    }
    // Cache the user lookup — every authenticated request does this DB hit
    // otherwise. 60s TTL bounds the staleness window for sensitive fields
    // (role, isConfirmed) that change via profile updates; those code paths
    // bust the cache explicitly.
    const user = await cacheWrap(
        `user:${payload.id}`,
        60,
        () => userRepo.findById({ id: payload.id }),
    )
    if (!user) {
        throw new NotFoundException("User not found");
    }
    if (!user.isConfirmed) {
        throw new NotConfirmedException("Please confirm your email to proceed")
    }
    // `user` comes from `cacheWrap` (Upstash / in-memory Map), so it has
    // been JSON-serialised and back. JSON has no Date type — the field
    // comes back as an ISO string, NOT a Date object, so `.getTime()`
    // blows up. `new Date(x)` is a no-op for an existing Date and parses
    // an ISO string safely, so this handles both shapes.
    if (user.isChangeCredentialsUpdated) {
        const changedAt = new Date(user.isChangeCredentialsUpdated).getTime()
        if (changedAt > payload.iat * 1000) {
            throw new ApplicationError("please login again", 400)
        }
    }
    return { user, payload }
}

export const auth = () => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const authorization = req.headers.authorization as string;
            const { user, payload } = await decodeToken({ authorization: authorization })
            res.locals.user = user;
            res.locals.payload = payload;
            next();
        } catch (error) {
            next(error)
        }
    }
}
