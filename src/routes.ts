
import { Router } from "express"
import { authRouter, authRoutes } from "./modules/auth";
import { companyRouter, companyRoutes } from "./modules/company";
import { userRouter, userRoutes } from "./modules/user";
import { internRouter, internRoutes, companyRouter as internCompanyRouter } from "./modules/internModule";
import { notificationRouter } from "./modules/notificationModule";
import { billingRouter, billingWebhookRouter } from "./modules/billingModule";
import { serveFileProxy } from "./utils/multer/fileProxy";
// Side-effect import: registers the subscribers that persist notifications
// when services publish events. Must run before any request is handled.
import "./utils/notifications/notificationBus"


const baseRouter = Router()
baseRouter.use(authRoutes.base, authRouter);
baseRouter.use(companyRoutes.base, companyRouter);
baseRouter.use(userRoutes.base, userRouter)
baseRouter.use(internRoutes.base, internRouter)
baseRouter.use('/company/:companyId/internships', internCompanyRouter)
baseRouter.use('/notifications', notificationRouter)
baseRouter.use('/company/:companyId/billing', billingRouter)
baseRouter.use('/webhooks/paymob', billingWebhookRouter)
// Proxy endpoint: serves Cloudinary raw files (PDFs) with correct
// Content-Type headers so browsers can open them directly.
// GET /file-proxy/<filename>.pdf?url=<cloudinary_url>
baseRouter.get('/file-proxy/:filename', serveFileProxy)
export default baseRouter