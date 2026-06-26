import { NextFunction, Request, Response } from "express";
import { UserModel } from "../DB/models/user.model";
import { UserRepo } from "../DB/repos/user.repo";
import { ApplicationError, InvalidTokenException, NotConfirmedException, NotFoundException } from "../utils/error";
import { verifyJwt } from "../utils/jwt";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";

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
        // Normalize jsonwebtoken errors (no statusCode) into InvalidTokenException
        if (err instanceof TokenExpiredError) {
            throw new InvalidTokenException("Token expired")
        }
        if (err instanceof JsonWebTokenError) {
            throw new InvalidTokenException("Invalid token")
        }
        throw new InvalidTokenException("Invalid token")
    }
    if (!payload.iat || !payload.id) {
        throw new InvalidTokenException("Invalid token payload");
    }
    const user = await userRepo.findById({ id: payload.id })
    if (!user) {
        throw new NotFoundException("User not found");
    }
    if (!user.isConfirmed) {
        throw new NotConfirmedException("Please confirm your email to proceed")
    }
    if (user.isChangeCredentialsUpdated?.getTime()! > payload.iat * 1000) {
        throw new ApplicationError("please login again", 400)
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
