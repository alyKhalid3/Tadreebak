
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
        
        if (file.size > 2000000 && storeIn === StoreIn.MEMORY) {
            return callback(new ApplicationError('File size is too large use disk not memory', 500), false)
        }
        else if (!fileType.includes(file.mimetype)) {
            return callback(new ApplicationError('File type is not allowed', 400), false)
        }
        callback(null, true)
    }






    return multer({ storage, fileFilter })
}