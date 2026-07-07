import { NextFunction, Request, Response } from "express";
import { ApplicationError } from "../utils/error";

/**
 * Multipart/form-data text fields arrive as strings. When a field is meant to
 * carry a JSON array/object, parse it before validation runs so the zod schema
 * sees the real structure. Pass the field name(s) to parse.
 */
export const parseJsonField = (fields: string | string[]) => async (req: Request, _res: Response, next: NextFunction) => {
    const fieldNames = Array.isArray(fields) ? fields : [fields]
    try {
        for (const field of fieldNames) {
            const raw = req.body?.[field]
            if (typeof raw === 'string' && raw.trim()) {
                req.body[field] = JSON.parse(raw)
            }
        }
        next()
    } catch (err) {
        next(new ApplicationError(`Malformed JSON in field(s): ${fieldNames.join(', ')}`, 400))
    }
}
