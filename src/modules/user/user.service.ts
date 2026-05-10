import { UserRepo } from './../../DB/repos/user.repo';
import { destroySingleFile, uploadSingleFile } from './../../utils/multer/cloudinary.service';
import multer from 'multer'
import { Request, Response, NextFunction } from 'express'
import { ApplicationError } from '../../utils/error'
import { successHandler } from '../../utils/successHandler'
import { isObjectIdOrHexString } from 'mongoose';


export class UserService {
    constructor() { }
    private userRepo = new UserRepo()
    uploadMedia = async (req: Request, res: Response, next: NextFunction) => {
        const { type } = req.params
        const user = res.locals.user
        const file = req.file as Express.Multer.File
        if (type !== 'profilePicture' && type !== 'coverPicture') {
            throw new ApplicationError('params type must be profilePicture or coverPicture', 400)
        }
        if (!file) {
            throw new ApplicationError("File is required", 400)
        }
        const { public_id, secure_url } = await uploadSingleFile({ path: file.path, folder: `/users/${user.firstName}_${user._id}/companies/${type}` })
        const old = user[type]
        if (old?.public_id) {
            await destroySingleFile(old.public_id)
        }
        const updatedUser = await this.userRepo.update({
            filter: { _id: user._id },
            data: {
                [type as string]: {
                    public_id,
                    secure_url
                }
            }
        })
        return successHandler({ res, message: "image uploaded successfully", data: { url: secure_url, public_id: public_id } })

    }
}