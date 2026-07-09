import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { CompanyRepo } from "../../DB/repos/company.repo";
import { UserRepo } from "../../DB/repos/user.repo";
import { PaymentOrderRepo } from "../../DB/repos/paymentOrder.repo";
import { PaymentOrderModel } from "../../DB/models/paymentOrder.model";
import { PaymentOrderStatus } from "../../DB/types/paymentOrder.type";
import { companyModel } from "../../DB/models/company.model";
import { PLANS, getPlanById } from "../../config/plans";
import { ApplicationError, NotFoundException } from "../../utils/error";
import { successHandler } from "../../utils/successHandler";
import { assertOwnedCompany } from "../../utils/companyAccess";
import {
    getAuthToken,
    registerOrder,
    generatePaymentKey,
    buildPaymentUrl,
    verifyCallbackHmac,
} from "../../utils/paymob/paymob.service";

export class BillingService {
    private companyRepo = new CompanyRepo()
    private userRepo = new UserRepo()
    private paymentOrderRepo = new PaymentOrderRepo()

    listPlans = async (req: Request, res: Response, next: NextFunction) => {
        try {
            return successHandler({ res, message: "Plans fetched successfully", data: { plans: PLANS } })
        } catch (error) {
            next(error)
        }
    }

    getCredits = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user

            const company = await assertOwnedCompany(companyId, user._id.toString())

            return successHandler({
                res,
                message: "Credits fetched successfully",
                data: { internshipCredits: company.internshipCredits },
            })
        } catch (error) {
            next(error)
        }
    }

    initiatePurchase = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const { planId } = req.body as { planId: string }
            const user = res.locals.user

            const company = await assertOwnedCompany(companyId, user._id.toString())

            const plan = getPlanById(planId)
            if (!plan) {
                throw new ApplicationError("Invalid plan id", 400)
            }

            const owner = await this.userRepo.findById({ id: company.createdBy.toString() })
            if (!owner) {
                throw new NotFoundException("Company owner not found")
            }

            // Create a pending payment order first so we have an _id to use as
            // the Paymob merchant_order_id (links the callback back to us).
            const paymentOrder = await this.paymentOrderRepo.create({
                data: {
                    companyId: new mongoose.Types.ObjectId(companyId),
                    planId: plan.id,
                    credits: plan.credits,
                    amountCents: plan.priceCents,
                    paymobOrderId: '',
                    status: PaymentOrderStatus.PENDING,
                },
            })

            // Paymob flow: auth → register order → payment key → iframe URL.
            const authToken = await getAuthToken()
            const paymobOrderId = await registerOrder({
                authToken,
                amountCents: plan.priceCents,
                merchantOrderId: (paymentOrder as any)._id.toString(),
            })

            // Persist the Paymob order id for webhook reconciliation.
            await this.paymentOrderRepo.update({
                filter: { _id: (paymentOrder as any)._id },
                data: { paymobOrderId },
            })

            const paymentKey = await generatePaymentKey({
                authToken,
                amountCents: plan.priceCents,
                paymobOrderId,
                billingData: {
                    firstName: owner.firstName,
                    lastName: owner.lastName,
                    email: owner.email,
                    phoneNumber: owner.phoneNumber || '01000000000',
                },
                redirectionUrl: process.env.PAYMOB_REDIRECTION_URL || 'http://localhost:3000/api/v1/webhooks/paymob',
            })

            const paymentUrl = buildPaymentUrl(paymentKey)

            return successHandler({
                res,
                message: "Payment initiated successfully",
                data: {
                    paymentUrl,
                    paymentOrderId: (paymentOrder as any)._id.toString(),
                },
            })
        } catch (error) {
            next(error)
        }
    }

    handlePaymobWebhook = async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Paymob sends the callback as either query params (GET redirect) or
            // a JSON body (POST server-to-server). Normalise both.
            const params = { ...req.query, ...req.body } as Record<string, any>

            // Paymob's callback structure varies. The HMAC may be at the top
            // level (GET redirect) or nested inside an 'obj' wrapper (POST).
            let hmac = (params.hmac as string) || ''
            if (!hmac && params.obj?.hmac) {
                hmac = params.obj.hmac as string
            }
            // Extract transaction data — when wrapped in 'obj', use its fields
            // for HMAC verification and order lookup.
            const txData = params.obj ?? params

            if (!hmac) {
                throw new ApplicationError("Missing HMAC signature", 400)
            }

            if (!verifyCallbackHmac(txData, hmac)) {
                throw new ApplicationError("Invalid HMAC signature", 400)
            }

            const paymobOrderId = txData.order?.id?.toString() || txData.order_id?.toString()
            if (!paymobOrderId) {
                throw new ApplicationError("Missing order id in callback", 400)
            }

            const paymentOrder = await this.paymentOrderRepo.findOne({
                filter: { paymobOrderId },
            })

            // Idempotent: if not found or already processed, acknowledge silently.
            if (!paymentOrder) {
                return successHandler({ res, message: "Callback acknowledged" })
            }
            if (paymentOrder.status !== PaymentOrderStatus.PENDING) {
                return successHandler({ res, message: "Callback already processed" })
            }

            const success = txData.success === true || txData.success === 'true'

            if (success) {
                await this.paymentOrderRepo.update({
                    filter: { _id: (paymentOrder as any)._id, status: PaymentOrderStatus.PENDING },
                    data: { status: PaymentOrderStatus.PAID, paidAt: new Date() },
                })

                // Atomically add credits to the company.
                await companyModel.updateOne(
                    { _id: paymentOrder.companyId },
                    { $inc: { internshipCredits: paymentOrder.credits } },
                )
            } else {
                await this.paymentOrderRepo.update({
                    filter: { _id: (paymentOrder as any)._id, status: PaymentOrderStatus.PENDING },
                    data: { status: PaymentOrderStatus.FAILED },
                })
            }

            return successHandler({ res, message: "Callback processed successfully" })
        } catch (error) {
            next(error)
        }
    }

    handleRedirect = async (req: Request, res: Response, next: NextFunction) => {
        return successHandler({ res, message: "Redirect acknowledged" })
    }

    // ---- Frontend confirms payment by sending the redirect query params.
    //      This is the dev/testing path when the Paymob server-to-server
    //      webhook isn't configured (or can't reach localhost). ----
    confirmPayment = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.params.companyId as string
            const user = res.locals.user
            const { paymentOrderId } = req.body as { paymentOrderId: string }
            // The frontend captures the full query string from Paymob's redirect
            // and sends its params here for HMAC verification + crediting.
            const txParams = req.body as Record<string, any>
            const hmac = (txParams.hmac as string) || ''

            await assertOwnedCompany(companyId, user._id.toString())

            const paymentOrder = await this.paymentOrderRepo.findOne({
                filter: { _id: paymentOrderId as any },
            })
            if (!paymentOrder) {
                throw new NotFoundException("Payment order not found")
            }
            if (paymentOrder.companyId.toString() !== companyId) {
                throw new NotFoundException("Payment order not found")
            }
            if (paymentOrder.status !== PaymentOrderStatus.PENDING) {
                return successHandler({ res, message: "Payment already processed", data: { status: paymentOrder.status } })
            }

            // Verify HMAC if present (POST webhooks include it; GET redirects
            // sometimes do too depending on the integration).
            if (hmac && !verifyCallbackHmac(txParams, hmac)) {
                throw new ApplicationError("Invalid HMAC signature", 400)
            }

            const success = txParams.success === 'true' || txParams.success === true

            if (success) {
                await this.paymentOrderRepo.update({
                    filter: { _id: (paymentOrder as any)._id, status: PaymentOrderStatus.PENDING },
                    data: { status: PaymentOrderStatus.PAID, paidAt: new Date() },
                })

                await companyModel.updateOne(
                    { _id: paymentOrder.companyId },
                    { $inc: { internshipCredits: paymentOrder.credits } },
                )

                return successHandler({
                    res,
                    message: "Payment confirmed and credits added",
                    data: { credits: paymentOrder.credits },
                })
            }

            await this.paymentOrderRepo.update({
                filter: { _id: (paymentOrder as any)._id, status: PaymentOrderStatus.PENDING },
                data: { status: PaymentOrderStatus.FAILED },
            })
            return successHandler({ res, message: "Payment marked as failed", data: { status: 'failed' } })
        } catch (error) {
            next(error)
        }
    }
}
