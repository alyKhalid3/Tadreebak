
import { Router } from "express"
import { authRouter, authRoutes } from "./modules/auth";
import { companyRouter, companyRoutes } from "./modules/company";
import { userRouter, userRoutes } from "./modules/user";
import { internRouter, internRoutes, companyRouter as internCompanyRouter } from "./modules/internModule";
import { notificationRouter } from "./modules/notificationModule";
import { billingRouter, billingWebhookRouter } from "./modules/billingModule";
import ratingRouter from "./modules/applicationModule/rating.controller";
import { serveFileProxy } from "./utils/multer/fileProxy";
import { auth } from "./middleware/authentication.middleware";
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
/**
 * @swagger
 * /file-proxy/{filename}:
 *   get:
 *     summary: Proxy a Cloudinary file with correct Content-Type
 *     description: |
 *       Serves a raw Cloudinary asset (PDF, doc, image) with the right
 *       Content-Type header so browsers can open it inline. Requires a
 *       valid bearer token, the `url` query param must point to a
 *       resource in the configured Cloudinary cloud, redirects are
 *       refused, and the response is capped at 10 MB.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Filename with extension (e.g. `resume.pdf`). The extension determines the Content-Type.
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *           format: uri
 *         description: Fully-encoded Cloudinary URL of the file to fetch.
 *     responses:
 *       200:
 *         description: File body streamed with the correct Content-Type.
 *         content:
 *           application/pdf: {}
 *           image/png: {}
 *           image/jpeg: {}
 *       400:
 *         description: Missing/invalid `url` or `url` does not target the configured Cloudinary cloud.
 *       401:
 *         description: Missing or invalid bearer token.
 *       413:
 *         description: File too large (>10 MB).
 */
baseRouter.get('/file-proxy/:filename', auth(), serveFileProxy)

baseRouter.use('/application', ratingRouter)

export default baseRouter