



import { Router } from "express";
import { InternService } from "./intern.service";
const router = Router()


export const internRoutes = {
    base: '/intern',
    create: '/',
    update: '/:internId',
    delete: '/:internId',
    getInternById: '/:internId'
}
const internService = new InternService()
router.post(internRoutes.create, internService.create)



export default router