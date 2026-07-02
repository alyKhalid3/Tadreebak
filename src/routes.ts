
import { Router } from "express"
import { authRouter, authRoutes } from "./modules/auth";
import { companyRouter, companyRoutes } from "./modules/company";
import { userRouter, userRoutes } from "./modules/user";
import { internRouter, internRoutes, companyRouter as internCompanyRouter } from "./modules/internModule";
import { serveFileProxy } from "./utils/multer/fileProxy";


const baseRouter = Router()
baseRouter.use(authRoutes.base, authRouter);
baseRouter.use(companyRoutes.base, companyRouter);
baseRouter.use(userRoutes.base, userRouter)
baseRouter.use(internRoutes.base, internRouter)
baseRouter.use('/company/:companyId/internships', internCompanyRouter)
// Proxy endpoint: serves Cloudinary raw files (PDFs) with correct
// Content-Type headers so browsers can open them directly.
// GET /file-proxy/<filename>.pdf?url=<cloudinary_url>
baseRouter.get('/file-proxy/:filename', serveFileProxy)
export default baseRouter