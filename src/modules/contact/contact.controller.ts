// Phase 14 / P3 #6 — Contact form controller.
//
// Single public endpoint. Validates the body, publishes a
// `send-email-contact-form` event so the support inbox gets the
// message via the existing `emailEmitter` pipeline (which uses
// the same Gmail SMTP transporter as every other system email).
//
// We don't return any data on success — the BACKEND_GAPS_EN
// wire contract is `{ msg: 'Message received' }` with a 201.
// We also don't log the message body server-side beyond the
// email transport (no audit log here; that can be a future
// report-row if needed).

import { Router } from "express"
import { validation } from "../../middleware/validation.middleware"
import { successHandler } from "../../utils/successHandler"
import { emailEmitter } from "../../utils/sendEmail/emailEvents"
import { contactFormSchema } from "./contact.validation"

const router = Router()

// Build a small HTML body for the support inbox. Plain-text
// alternative is constructed by `sendEmail` (toPlainText helper
// in sendEmail.ts) so we don't need to ship a separate string.
const contactFormTemplate = ({
    name,
    email,
    subject,
    message,
}: {
    name: string
    email: string
    subject?: string
    message: string
}) => `<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a;">
    <h2 style="margin: 0 0 16px 0;">New contact-form submission</h2>
    <table cellpadding="6" style="border-collapse: collapse;">
      <tr><td><strong>Name</strong></td><td>${name}</td></tr>
      <tr><td><strong>Email</strong></td><td>${email}</td></tr>
      ${subject ? `<tr><td><strong>Subject</strong></td><td>${subject}</td></tr>` : ''}
    </table>
    <hr style="margin: 16px 0; border: 0; border-top: 1px solid #e5e5e5;" />
    <p style="white-space: pre-wrap; margin: 0;">${message}</p>
  </body>
</html>`

/**
 * @swagger
 * /contact:
 *   post:
 *     summary: Submit the public contact form
 *     description: |
 *       Public, no auth required. Validates the body and emails
 *       it to the support inbox via the existing SMTP
 *       transporter. Rate limiting is delegated to
 *       `express-rate-limit` (configured at the app level).
 *     tags: [Contact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ContactForm' }
 *     responses:
 *       201:
 *         description: Message received
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
 *                   example: Message received
 *       400:
 *         description: Validation error (missing/invalid name, email, message)
 */
router.post('/', validation(contactFormSchema), (req, res, next) => {
    try {
        const { name, email, subject, message } = req.body as {
            name: string
            email: string
            subject?: string
            message: string
        }
        // Recipients fall back to the configured EMAIL env var
        // (the same address used as the from / reply-to) — no
        // separate SUPPORT_EMAIL config needed for the first
        // iteration. The `EMAIL` env var is required already
        // because the rest of the auth / OTP flow uses it.
        const to = process.env.SUPPORT_EMAIL ?? process.env.EMAIL ?? ''
        if (!to) {
            // Configuration error — surface a 500 rather than a
            // misleading 201 success.
            throw new Error('No support email configured')
        }
        emailEmitter.publish('send-email-contact-form', {
            to,
            subject: subject ? `[Contact] ${subject}` : `[Contact] New message from ${name}`,
            html: contactFormTemplate(
                subject !== undefined
                    ? { name, email, subject, message }
                    : { name, email, message },
            ),
            replyTo: email,
        })
        return successHandler({
            res,
            status: 201,
            message: 'Message received',
            data: null,
        })
    } catch (err) {
        next(err)
    }
})

export { router as contactRouter }

/**
 * @swagger
 * components:
 *   schemas:
 *     ContactForm:
 *       type: object
 *       required: [name, email, message]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         email:
 *           type: string
 *           format: email
 *         subject:
 *           type: string
 *           minLength: 2
 *           maxLength: 200
 *         message:
 *           type: string
 *           minLength: 10
 *           maxLength: 2000
 */
