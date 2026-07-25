import { Router } from "express";
import { ApplicationService } from "./application.service";
import { validation } from "../../middleware/validation.middleware";
import { auth } from "../../middleware/authentication.middleware";
import { rateApplicationSchema } from "./application.validation";

const router = Router()

const applicationService = new ApplicationService()

/**
 * @swagger
 * /application/{applicationId}/rate:
 *   post:
 *     summary: Submit a rating for a completed application
 *     tags: [Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - score
 *             properties:
 *               score:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       201:
 *         description: Rating submitted successfully
 *       400:
 *         description: Application must be completed before rating
 *       403:
 *         description: Not authorized to rate this application
 *       404:
 *         description: Application not found
 *       409:
 *         description: You have already rated this application
 */
router.post(
    '/:applicationId/rate',
    auth(),
    validation(rateApplicationSchema),
    applicationService.rate,
)

/**
 * @swagger
 * /application/{applicationId}/ratings:
 *   get:
 *     summary: Get ratings for a completed application (blind until both submit or 14 days pass)
 *     tags: [Ratings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ratings fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 studentRating:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     submitted:
 *                       type: boolean
 *                     score:
 *                       type: integer
 *                     comment:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                 companyRating:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     submitted:
 *                       type: boolean
 *                     score:
 *                       type: integer
 *                     comment:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                 bothSubmitted:
 *                   type: boolean
 *       403:
 *         description: Not authorized to view ratings for this application
 *       404:
 *         description: Application not found
 */
router.get(
    '/:applicationId/ratings',
    auth(),
    applicationService.getRatings,
)

export default router
