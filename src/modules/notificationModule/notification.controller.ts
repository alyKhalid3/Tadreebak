import { Router } from "express";
import { NotificationService } from "./notification.service";
import { auth } from "../../middleware/authentication.middleware";
import { validation } from "../../middleware/validation.middleware";
import { listNotificationsQuerySchema } from "./notification.validation";

const router = Router();
const notificationService = new NotificationService()

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List the authenticated user's notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "false"
 *       - in: query
 *         name: page
 *         schema:
 *           type: string
 *           default: "1"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *           default: "10"
 *     responses:
 *       200:
 *         description: Notifications fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
    '/',
    auth(),
    validation(listNotificationsQuerySchema),
    notificationService.list
)

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Get the count of unread notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 */
router.get('/unread-count', auth(), notificationService.unreadCount)

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: Mark all of the user's notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch('/read-all', auth(), notificationService.markAllRead)

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
router.patch('/:id/read', auth(), notificationService.markRead)

export default router
