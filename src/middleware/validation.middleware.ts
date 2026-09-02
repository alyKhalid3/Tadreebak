import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ValidationError } from "../utils/error";

/**
 * `source` lets you validate just one part of the request:
 *   - "body" (default) — the JSON body
 *   - "query" — the URL query string
 *   - "params" — the route params
 *   - undefined (or "merged") — the original behavior: body + query + params
 *     + file metadata, all merged. The old code's `req.file` was leaking into
 *     `req.body.legalAttachment` even for endpoints that don't accept a
 *     file, which is why most zod schemas have a permissive
 *     `.optional()` on that field.
 */
type ValidationSource = "body" | "query" | "params" | "merged"

export const validation = (
    schema: z.ZodType<any>,
    source: ValidationSource = "merged",
) => (req: Request, _res: Response, next: NextFunction) => {
    const body = req.body ?? {};
    const query = req.query ?? {};
    const params = req.params ?? {};

    const target =
        source === "body" ? body :
        source === "query" ? query :
        source === "params" ? params :
        { ...body, ...params, ...query, files: req.files, legalAttachment: req.file }

    const result = schema.safeParse(target);
    if (!result.success) {
        const errors = result.error.issues.map((error) => `${error.path}=>${error.message}`)
        throw new ValidationError(errors.join(','))
    }

    // For single-source validation, we can be strict about which part of
    // the request we overwrite. For the legacy merged mode, replicate the
    // existing body/query split so callers that depend on it don't break.
    if (source === "body" || source === "params" || source === "merged") {
        const bodyKeys = new Set(Object.keys(body))
        const queryKeys = new Set(Object.keys(query))

        const cleanBody: Record<string, any> = {}
        const cleanQuery: Record<string, any> = {}
        const { files, legalAttachment, ...sanitized } = result.data as Record<string, any>

        for (const [key, value] of Object.entries(sanitized)) {
            if (queryKeys.has(key)) cleanQuery[key] = value
            else cleanBody[key] = value
        }

        req.body = cleanBody;
        Object.defineProperty(req, 'query', {
            writable: true,
            configurable: true,
            enumerable: true,
            value: cleanQuery,
        });
    } else {
        // source === "query" — only overwrite req.query
        Object.defineProperty(req, 'query', {
            writable: true,
            configurable: true,
            enumerable: true,
            value: result.data,
        });
    }

    next();
}