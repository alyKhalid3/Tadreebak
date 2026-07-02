import { cloudConfig } from "./cloudinary"

// Cloudinary stores files differently based on resource_type:
//   - "image" (default) — for pictures; the URL path is /image/upload/...
//   - "raw"              — for PDFs and other non-image files; path is /raw/upload/...
// If a PDF is uploaded as "image" (the Cloudinary default), its link resolves
// but never opens correctly. Callers must pass resourceType: "raw" for PDFs.
//
// NOTE: Cloudinary's CDN URL parser treats the last dot-separated segment as a
// "format" suffix. You CANNOT put .pdf in the URL path for raw files — it will
// 404 (wrong format) or 401 (raw→pdf conversion not allowed). The raw file's
// Cloudinary URL will always have a random public_id with no extension. Browsers
// need a proxy endpoint that serves the file with correct Content-Type headers.
export const uploadSingleFile = async ({
    path,
    folder = "others",
    resourceType = "image",
}: {
    path: string,
    folder?: string,
    resourceType?: "image" | "raw",
}) => {
    const { public_id, secure_url } = await cloudConfig().uploader.upload(path, {
        folder: `${process.env.APP_NAME}/${folder}`,
        resource_type: resourceType,
    })
    return { public_id, secure_url }
}

export const uploadMultiFiles = async ({ paths = [], dest }: { paths?: string[], dest?: string }) => {
    const images = []
    for (const path of paths) {
        const { public_id, secure_url } = await uploadSingleFile({ path, ...(dest && { folder: dest }) })
        images.push({ public_id, secure_url })
    }
    return images
}

// Destroy must match the resource_type the file was uploaded with, otherwise
// the destroy call silently does nothing. "raw" covers PDFs; default covers images.
export const destroySingleFile = async (public_id: string, resourceType: "image" | "raw" = "image") => {
    await cloudConfig().uploader.destroy(public_id, { resource_type: resourceType })
}

export const deleteManyFiles = async ({ public_ids = [] }: { public_ids?: string[] }) => {
    await cloudConfig().api.delete_resources(public_ids)
}
export const deleteByPrefix = async ({ prefix = "" }: { prefix?: string }) => {
    await cloudConfig().api.delete_resources_by_prefix(`${process.env.APP_NAME}/${prefix}`)
}
export const deleteFolder = async ({ folder = "" }: { folder?: string }) => {
    await cloudConfig().api.delete_folder(`${process.env.APP_NAME}/${folder}`)
}
