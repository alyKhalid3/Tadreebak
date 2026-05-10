import { NextFunction, Request, Response } from "express";
import { UserModel } from "../DB/models/user.model";
import { UserRepo } from "../DB/repos/user.repo";
import { ApplicationError, InvalidTokenException, NotConfirmedException, NotFoundException } from "../utils/error";
import { verifyJwt } from "../utils/jwt";

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
    if (!authorization) {
        throw new InvalidTokenException("Invalid token");
    }
    if (!authorization.startsWith(process.env.BEARER as string)) {
        throw new InvalidTokenException("Invalid token");
    }

    const token = authorization.split(" ")[1]
    if (!token) {
        throw new InvalidTokenException("Invalid token");
    }
    const payload = verifyJwt(token,
        tokenType === tokenTypeEnum.ACCESS ?
            process.env.ACCESS_TOKEN_SECRET as string
            : process.env.REFRESH_TOKEN_SECRET as string
    )
    const user = await userRepo.findById({ id: payload.id })
    if (!user) {
        throw new NotFoundException("User not found");
    }
    if (!user.isConfirmed) {
        throw new NotConfirmedException("Please confirm your email to proceed")
    }
    if (user.isChangeCredentialsUpdated?.getTime() > payload.iat * 1000) {
        throw new ApplicationError("please login again", 400)
    }
    return { user, payload }
}

export const auth = () => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const authorization = req.headers.authorization as string;
        const { user, payload } = await decodeToken({ authorization: authorization })
        res.locals.user = user;
        res.locals.payload = payload;
        next();

    }
}