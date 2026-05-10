import { cloudConfig } from "./cloudinary"

export const uploadSingleFile = async ({ path, folder = "others" }: { path: string, folder?: string }) => {
    const { public_id, secure_url } = await cloudConfig().uploader.upload(path, {
        folder: `${process.env.APP_NAME}/${folder}`
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
export const destroySingleFile = async (public_id: string) => {
    await cloudConfig().uploader.destroy(public_id)
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
