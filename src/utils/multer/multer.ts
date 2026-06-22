
import { Request } from "express"
import multer, { diskStorage, memoryStorage } from "multer"
import { ApplicationError } from "../error"



export enum StoreIn {
    MEMORY = 'memory',
    DISK = 'disk'
}
export const fileTypes = {
    images: ['image/jpeg', 'image/png', 'image/jpg'],
    video: ['video/mp4', 'video/ogg', 'video/mkv', 'video/webm'],
    pdf: ['application/pdf']
}

// Max file size enforced by multer while the stream is being received.
// file.size is not known inside fileFilter, so the limit must live here.
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB


export const uploadFile = ({
    storeIn = StoreIn.MEMORY,
    fileType = fileTypes.images
}:
    {
        storeIn?: StoreIn,
        fileType?: string[]
    }): multer.Multer => {
    const storage = storeIn === StoreIn.MEMORY ? memoryStorage() : diskStorage({})


    const fileFilter = (req: Request, file: Express.Multer.File, callback: CallableFunction): void => {
        if (!fileType.includes(file.mimetype)) {
            return callback(new ApplicationError('File type is not allowed', 400), false)
        }
        callback(null, true)
    }


    return multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } })
}
