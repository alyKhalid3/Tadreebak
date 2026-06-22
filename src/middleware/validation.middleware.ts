
import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ValidationError } from "../utils/error";


// Parse a single combined schema against body + params + query + files, then
// write the *validated* data back to the request. This is what services read,
// so only fields the schema explicitly allows can ever reach the database —
// preventing mass-assignment (e.g. a client sending { role: 'admin' }).
export const validation = (schema: z.ZodType<any>) => (req: Request, _res: Response, next: NextFunction) => {
    const merged = {
        ...req.body,
        ...req.params,
        ...req.query,
        files: req.files,
        legalAttachment: req.file,
    }
    const result = schema.safeParse(merged);
    if (!result.success) {
        const errors = result.error.issues.map((error) => `${error.path}=>${error.message}`)
        throw new ValidationError(errors.join(','))
    }

    const bodyKeys = new Set(Object.keys(req.body))
    const queryKeys = new Set(Object.keys(req.query))

    const cleanBody: Record<string, any> = {}
    const cleanQuery: Record<string, any> = {}
    const { files, legalAttachment, ...sanitized } = result.data as Record<string, any>

    for (const [key, value] of Object.entries(sanitized)) {
        if (queryKeys.has(key)) cleanQuery[key] = value
        else if (bodyKeys.has(key)) cleanBody[key] = value
        else cleanBody[key] = value
    }

    req.body = cleanBody
    req.query = cleanQuery as any
    // Path params come from the route definition (not user JSON) and are
    // format-checked by each controller, so we keep them as-is.
    next();
}


