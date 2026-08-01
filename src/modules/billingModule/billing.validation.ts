import { z } from "zod";
import { PLANS } from "../../config/plans";

export const purchasePlanSchema = z.object({
    planId: z.enum(PLANS.map(p => p.id) as [string, ...string[]]),
})

/**
 * M9: previously `.passthrough()` was used without justification. The real
 * reason we keep unknown fields around is that Paymob's callback shape is
 * heterogeneous: GET redirects come in as flat query-string keys, POST
 * webhooks arrive wrapped in an `obj` envelope with the same fields nested.
 * We rebuild a uniform `txParams` object inside the service to feed
 * `verifyCallbackHmac`.
 *
 * The actual security gate is the HMAC: the service refuses to credit
 * anything if `hmac` is missing or fails verification (see C1 in the
 * audit). The schema just makes sure `paymentOrderId` is present.
 */
export const confirmPaymentSchema = z.object({
    paymentOrderId: z.string().min(1),
}).passthrough()
