// Shared attachment shape. Used by both Task and Project for any
// file the company admin uploads (cover briefs, task specs, etc.).
// Stored on Cloudinary; the server keeps the public_id so we can
// destroy it later.

export interface IAttachment {
    public_id: string
    secure_url: string
    name: string
    mimeType: string
    size: number
}
