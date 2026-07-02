import { Readable } from "stream"
import { Request, Response, NextFunction } from "express"

// Cloudinary raw files (PDFs, docs) are stored with random public_ids and no
// file extension. Cloudinary's CDN URL parser treats the last dot-separated
// segment as a "format" suffix, so you CANNOT put .pdf in the URL — it will
// 404 or 401. Instead, this proxy fetches the file from Cloudinary and serves
// it with correct Content-Type / Content-Disposition headers.
//
// Usage from frontend:
//   GET /api/v1/file-proxy/<filename>?url=<encoded cloudinary url>
//
// Example:
//   GET /api/v1/file-proxy/resume.pdf?url=https%3A%2F%2Fres.cloudinary.com%2F...%2Fabc123
//
// The filename in the URL path ensures browsers see the extension (e.g. .pdf)
// in the address bar and can open the file correctly.

const ALLOWED_HOSTS = [process.env.CLOUDINARY_URL_HOST || "res.cloudinary.com"]

const EXTENSION_MAP: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

        // Validate the URL host to prevent SSRF / open-redirect
        const parsed = new URL(url)
        if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
            res.status(400).json({ message: "url must point to an allowed Cloudinary host" })
            return
        }

        const response = await fetch(url)
        if (!response.ok || !response.body) {
            res.status(502).json({ message: "Failed to fetch file from Cloudinary" })
            return
        }

        // Determine content type from the filename extension
        const ext = filename.split(".").pop()?.toLowerCase() || ""
        const contentType = EXTENSION_MAP[ext] || "application/octet-stream"

        res.setHeader("Content-Type", contentType)
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`)
        res.setHeader("Cache-Control", "public, max-age=86400")

        // Pipe the response body to the client
        Readable.fromWeb(response.body as any).pipe(res)
    } catch (error) {
        next(error)
    }
}
