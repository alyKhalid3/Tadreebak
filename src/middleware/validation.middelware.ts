import { Join } from './../../node_modules/mongodb/src/mongo_types';


import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ValidationError } from "../utils/error";


export const validation = (schema: z.ZodType<any>) => (req: Request, res: Response, next: NextFunction) => {
    const data = {
        ...req.body,
        ...req.params,
        ...req.query,
        files: req.files,
        legalAttachment: req.file,
    }
    const result = schema.safeParse(data);
    if (!result.success) {
        const errors = result.error.issues.map((error) => {
            return `${error.path}=>${error.message}`
        })
        throw new ValidationError(errors.join(','))
    }
    next();
}


