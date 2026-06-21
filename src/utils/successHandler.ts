import { Response } from "express";

export const successHandler = ({ res, data = {}, message = 'done', status = 200 }: { res: Response, data?: Object|null, message?: string, status?: number }): Response => {
    return res.status(status).json({data, msg: message })
}