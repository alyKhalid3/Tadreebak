import { Router } from "express";
import { BillingService } from "./billing.service";
import { validation } from "../../middleware/validation.middleware";
import { auth } from "../../middleware/authentication.middleware";
import * as BillingValidation from "./billing.validation";

const billingService = new BillingService()

// Company-scoped router — mounted at /company/:companyId/billing
// Inherits :companyId via mergeParams.
const billingRouter = Router({ mergeParams: true })

/**
 * @swagger
 * /company/{companyId}/billing/plans:
 *   get:
 *     summary: List available plans
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Plans fetched successfully
 *       403:
 *         description: You are not the owner of this company
 */
billingRouter.get('/plans', auth(), billingService.listPlans)

/**
 * @swagger
 * /company/{companyId}/billing/credits:
 *   get:
 *     summary: Get current internship credits
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Credits fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     internshipCredits:
 *                       type: integer
 *                 msg:
 *                   type: string
 *       403:
 *         description: You are not the owner of this company
 */
billingRouter.get('/credits', auth(), billingService.getCredits)

/**
 * @swagger
 * /company/{companyId}/billing/plans/purchase:
 *   post:
 *     summary: Initiate a plan purchase via Paymob
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
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
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *                 enum: [starter, growth, enterprise]
 *     responses:
 *       200:
 *         description: Payment initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentUrl:
 *                       type: string
 *                     paymentOrderId:
 *                       type: string
 *                 msg:
 *                   type: string
 *       400:
 *         description: Invalid plan id
 *       403:
 *         description: You are not the owner of this company
 */
billingRouter.post('/plans/purchase', auth(), validation(BillingValidation.purchasePlanSchema), billingService.initiatePurchase)

/**
 * @swagger
 * /company/{companyId}/billing/payment/confirm:
 *   post:
 *     summary: Confirm a payment after Paymob redirect (frontend test/dev path)
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
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
 *               - paymentOrderId
 *             properties:
 *               paymentOrderId:
 *                 type: string
 *               success:
 *                 type: string
 *               hmac:
 *                 type: string
 *               id:
 *                 type: string
 *               order:
 *                 type: string
 *               amount_cents:
 *                 type: string
 *                 description: (plus any other params from the Paymob redirect query string)
 *     responses:
 *       200:
 *         description: Payment confirmed and credits added
 *       400:
 *         description: Payment order not found / HMAC invalid
 *       403:
 *         description: You are not the owner of this company
 */
billingRouter.post('/payment/confirm', auth(), validation(BillingValidation.confirmPaymentSchema), billingService.confirmPayment)

// Public webhook router — mounted at /webhooks/paymob
// No auth; Paymob calls this server-to-server after a payment attempt.
const billingWebhookRouter = Router()

/**
 * @swagger
 * /webhooks/paymob:
 *   post:
 *     summary: Paymob payment callback webhook
 *     tags: [Billing]
 *     description: Called by Paymob server-to-server after a payment attempt. Verifies HMAC, credits the company on success.
 *     responses:
 *       200:
 *         description: Callback processed
 *       400:
 *         description: Invalid/missing HMAC or order id
 */
billingWebhookRouter.post('/', billingService.handlePaymobWebhook)

/**
 * @swagger
 * /webhooks/paymob:
 *   get:
 *     summary: Paymob payment redirect callback (light — just acknowledges)
 *     tags: [Billing]
 *     description: >
 *       Paymob redirects the user here after iframe payment. The full transaction
 *       data with HMAC is sent via a separate POST webhook; this GET handler just acknowledges.
 *     responses:
 *       200:
 *         description: Redirect acknowledged
 */
billingWebhookRouter.get('/', billingService.handleRedirect)

export { billingRouter, billingWebhookRouter }
