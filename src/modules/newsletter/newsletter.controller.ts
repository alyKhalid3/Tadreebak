// Phase 15 / P3 #7 — Newsletter subscribe controller.
//
// Public, no auth. Today's behavior: validate the email, then
// publish a `send-email-newsletter-confirmation` event so a
// confirmation email goes out via the existing SMTP
// transporter. The wire shape matches BACKEND_GAPS_EN §7
// (`{ msg: 'Subscribed' }` with 201).
//
// When the email-list backend lands (Mailchimp / Sendy /
// internal), the only change is to add a `subscribe(email)`
// call here alongside the event publish.

import { Router } from "express"
import { validation } from "../../middleware/validation.middleware"
import { successHandler } from "../../utils/successHandler"
import { emailEmitter } from "../../utils/sendEmail/emailEvents"
import { newsletterSubscribeSchema } from "./newsletter.validation"

const router = Router()

const newsletterConfirmationTemplate = ({ email }: { email: string }) =>
    `<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a;">
    <h2 style="margin: 0 0 16px 0;">You're subscribed to Tadreebak updates</h2>
    <p style="margin: 0 0 12px 0;">Thanks for subscribing — we'll send new internship
       alerts and product updates to <strong>${email}</strong>.</p>
    <p style="color: #666; font-size: 13px; margin-top: 24px;">
       You can unsubscribe at any time from the footer of any email.
    </p>
  </body>
</html>`

/**
 * @swagger
 * /newsletter/subscribe:
 *   post:
 *     summary: Subscribe an email to the newsletter
 *     description: |
 *       Public, no auth. Validates the email address and
 *       publishes a confirmation event. When the email-list
 *       backend lands, this is also where the actual subscribe
 *       call will live.
 *     tags: [Newsletter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/NewsletterSubscribe' }
 *     responses:
 *       201:
 *         description: Subscribed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   example: null
 *                 msg:
 *                   type: string
 *                   example: Subscribed
 *       400:
 *         description: Invalid email
 */
router.post(
    '/subscribe',
    validation(newsletterSubscribeSchema),
    (req, res, next) => {
        try {
            const { email } = req.body as { email: string }
            emailEmitter.publish('send-email-newsletter-confirmation', {
                to: email,
                subject: 'Welcome to the Tadreebak newsletter',
                html: newsletterConfirmationTemplate({ email }),
            })
            return successHandler({
                res,
                status: 201,
                message: 'Subscribed',
                data: null,
            })
        } catch (err) {
            next(err)
        }
    },
)

export { router as newsletterRouter }

/**
 * @swagger
 * components:
 *   schemas:
 *     NewsletterSubscribe:
 *       type: object
 *       required: [email]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 */
