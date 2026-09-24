// Phase 17 / P5 #11 — Public certificate verification endpoint.
//
// `GET /certificates/:code` — no auth. Validates the code shape,
// then asks the service to:
//   1. Verify the HMAC signature (rejects forged codes fast).
//   2. Look up the application + student + internship + company
//      in a single $lookup chain.
//   3. Return the narrow public projection (no email, no full
//      last name, no internal IDs).
//
// On every failure mode we return `{ data: { valid: false } }`
// with status 200. This collapses "forged", "tampered",
// "unknown app", "not yet completed", "deleted" into one
// observable response so an attacker can't fingerprint which
// dimension failed. The 400 path fires only when the URL
// parameter doesn't even look like a code (validation rejects
// the shape).

import { Router } from "express"
import { validation } from "../../middleware/validation.middleware"
import { successHandler } from "../../utils/successHandler"
import { certificateService } from "./certificates.service"
import { certificateCodeSchema } from "./certificates.validation"

const router = Router()

/**
 * @swagger
 * /certificates/{code}:
 *   get:
 *     summary: Verify a public internship-completion certificate
 *     description: |
 *       Public, no auth required. The `code` is a base64url-encoded
 *       HMAC-SHA256 token minted by `markCompleted` — anyone with
 *       the URL can verify, but only the platform can mint.
 *
 *       The endpoint collapses every failure mode (forged signature,
 *       unknown application, application not yet completed, deleted
 *       application) into a single `{ valid: false }` response so an
 *       attacker can't fingerprint which dimension failed.
 *
 *       On success, the response exposes only the narrow public
 *       projection: student's first name + last initial, internship
 *       title, company name + logo URL, and the canonical completion
 *       timestamp. No email, no full last name, no internal IDs.
 *     tags: [Certificates]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           description: HMAC-signed base64url `<payload>.<signature>` token.
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/CertificateVerified'
 *                     - $ref: '#/components/schemas/CertificateInvalid'
 *                 msg:
 *                   type: string
 *                   example: ok
 *       400:
 *         description: Invalid verification code format (URL param doesn't even look like a code)
 */
router.get(
    '/:code',
    validation(certificateCodeSchema, 'params'),
    async (req, res, next) => {
        try {
            const code = req.params.code as string
            const result = await certificateService.verify(code)
            return successHandler({
                res,
                status: 200,
                message: 'ok',
                data: result,
            })
        } catch (err) {
            next(err)
        }
    },
)

export { router as certificatesRouter }

/**
 * @swagger
 * components:
 *   schemas:
 *     CertificateVerified:
 *       type: object
 *       description: A verified certificate. Same shape regardless of which underlying application was looked up.
 *       properties:
 *         valid:
 *           type: boolean
 *           enum: [true]
 *         student:
 *           type: object
 *           properties:
 *             firstName:
 *               type: string
 *             lastInitial:
 *               type: string
 *               description: First letter of the student's last name + dot, e.g. "M.". Empty when the student has no last name on file. Privacy-preserving — the full last name is never exposed.
 *         internship:
 *           type: object
 *           properties:
 *             title:
 *               type: string
 *         company:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *             logo:
 *               type: string
 *               nullable: true
 *               format: uri
 *         completedAt:
 *           type: string
 *           format: date-time
 *
 *     CertificateInvalid:
 *       type: object
 *       description: Returned for every verification failure (forged, tampered, unknown, not-yet-completed). The shape is intentionally identical across all failure modes so an attacker can't fingerprint which dimension failed.
 *       properties:
 *         valid:
 *           type: boolean
 *           enum: [false]
 */