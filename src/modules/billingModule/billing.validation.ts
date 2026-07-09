import { z } from "zod";
import { PLANS } from "../../config/plans";

export const purchasePlanSchema = z.object({
    planId: z.enum(PLANS.map(p => p.id) as [string, ...string[]]),
})

export const confirmPaymentSchema = z.object({
    paymentOrderId: z.string().min(1),
}).passthrough()
