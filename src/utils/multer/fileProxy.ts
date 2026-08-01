import { Readable } from "stream"
import { Request, Response, NextFunction } from "express"

// Cloudinary raw files (PDFs, docs) are stored with random public_ids and no
// file extension. Cloudinary's CDN URL parser treats the last dot-separated
// segment as a "format" suffix, so you CANNOT put .pdf in the URL — it will
// 404 or 401. Instead, this proxy fetches the file from Cloudinary and serves
// it with correct Content-Type / Content-Disposition headers.
//
// Usage from frontend:
//   GET /api/v1/file-proxy/<filename>.pdf?url=<encoded cloudinary url>
//
// Example:
//   GET /api/v1/file-proxy/resume.pdf?url=https%3A%2F%2Fres.cloudinary.com%2F...%2Fabc123
//
// The filename in the URL path ensures browsers see the extension (e.g. .pdf)
// in the address bar and can open the file correctly.

// C10 hardening: only the configured Cloudinary cloud is allowed, and the
// URL must match the configured cloud_name in its first path segment. We
// also require an authenticated user — anonymous traffic can't pull CVs
// out of Cloudinary. The previous version was a fully open SSRF-with-redirect
// proxy that anyone could use to fetch any URL whose hostname matched a
// single string.

const ALLOWED_CLOUD_NAME = process.env.CLOUD_NAME
const EXPECTED_HOST = "res.cloudinary.com"
const FETCH_TIMEOUT_MS = 5000
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB hard cap on what we'll relay

const EXTENSION_MAP: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
}

export const serveFileProxy = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const url = req.query.url as string | undefined
        // Filename comes from the URL path param (e.g. "resume.pdf")
        const filename = String(req.params.filename || "download").replace(/[^a-zA-Z0-9._-]/g, "_")

        if (!url) {
            res.status(400).json({ message: "url query parameter is required" })
            return
        }

        let parsed: URL
        try {
            parsed = new URL(url)
        } catch {
            res.status(400).json({ message: "url is not a valid URL" })
            return
        }

        // Strict host + cloud check. The path of a Cloudinary delivery URL
        // starts with `/<cloud_name>/`, so we verify that exactly.
        if (parsed.hostname !== EXPECTED_HOST) {
            res.status(400).json({ message: "url must point to the configured Cloudinary host" })
            return
        }
        if (ALLOWED_CLOUD_NAME) {
            const pathParts = parsed.pathname.split("/").filter(Boolean)
            if (pathParts[0] !== ALLOWED_CLOUD_NAME) {
                res.status(400).json({ message: "url must target the configured Cloudinary cloud" })
                return
            }
        }
        // Forbid userinfo tricks (e.g. https://res.cloudinary.com@evil.com/...).
        if (parsed.username || parsed.password) {
            res.status(400).json({ message: "url must not contain userinfo" })
            return
        }

        // Bound the upstream read with a timeout. Without this, a slow
        // (or hijacked-via-redirect) host can hold a request open indefinitely.
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        const response = await fetch(url, {
            redirect: "manual", // do NOT follow 30x — a redirect to evil.com would be SSRF
            signal: controller.signal,
        })
        clearTimeout(timer)
        if (response.status >= 300 && response.status < 400) {
            res.status(502).json({ message: "Upstream redirect refused" })
            return
        }
        if (!response.ok || !response.body) {
            res.status(502).json({ message: "Failed to fetch file from Cloudinary" })
            return
        }
        const contentLength = Number(response.headers.get("content-length") ?? 0)
        if (contentLength > MAX_BYTES) {
            res.status(413).json({ message: "File too large" })
            return
        }

        // Determine content type from the filename extension
        const ext = filename.split(".").pop()?.toLowerCase() || ""
        const contentType = EXTENSION_MAP[ext] || "application/octet-stream"

        res.setHeader("Content-Type", contentType)
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`)
        res.setHeader("Cache-Control", "private, max-age=300")
        res.setHeader("X-Content-Type-Options", "nosniff")

        // Enforce a byte cap while streaming so a malicious upstream can't
        // send gigabytes. The body is a Web ReadableStream under Node 18+.
        const reader = (response.body as any).getReader()
        let received = 0
        const pump = async () => {
            try {
                while (true) {
                    const { value, done } = await reader.read()
                    if (done) break
                    if (value) {
                        received += value.byteLength ?? value.length ?? 0
                        if (received > MAX_BYTES) {
                            await reader.cancel()
                            res.destroy()
                            return
                        }
                        const ok = res.write(Buffer.from(value))
                        if (!ok) {
                            await new Promise<void>((resolve) => res.once("drain", resolve))
                        }
                    }
                }
                res.end()
            } catch (err) {
                res.destroy(err as Error)
            }
        }
        void pump()
    } catch (error) {
        next(error)
    }
}
