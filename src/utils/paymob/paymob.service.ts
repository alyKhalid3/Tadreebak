import crypto from "node:crypto";

const BASE_URL = 'https://accept.paymob.com/api';

const env = (name: string): string => {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing required env var: ${name}. Set it in src/config/.env`)
    }
    return value
}

/**
 * Step 1 — authenticate with Paymob to obtain a bearer auth token.
 * The token is short-lived (~1 hour) so callers should request a fresh
 * one per purchase flow rather than caching.
 */
export const getAuthToken = async (): Promise<string> => {
    const res = await fetch(`${BASE_URL}/auth/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: env('PAYMOB_API_KEY') }),
    })
    if (!res.ok) {
        throw new Error(`Paymob auth failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json() as { token: string }
    return data.token
}

/**
 * Step 2 — register an order with Paymob. Returns Paymob's order ID.
 * merchantOrderId links back to our PaymentOrder._id so the webhook can
 * reconcile the callback.
 */
export const registerOrder = async (params: {
    authToken: string
    amountCents: number
    merchantOrderId: string
}): Promise<string> => {
    const res = await fetch(`${BASE_URL}/ecommerce/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            auth_token: params.authToken,
            delivery_needed: 'false',
            amount_cents: params.amountCents,
            currency: 'EGP',
            merchant_order_id: params.merchantOrderId,
            items: [],
        }),
    })
    if (!res.ok) {
        throw new Error(`Paymob order registration failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json() as { id: number }
    return data.id.toString()
}

/**
 * Step 3 — generate a payment key. The key is embedded in the iframe URL
 * and authorises the card payment for this specific order + amount.
 */
export const generatePaymentKey = async (params: {
    authToken: string
    amountCents: number
    paymobOrderId: string
    billingData: { firstName: string, lastName: string, email: string, phoneNumber: string }
    redirectionUrl: string
}): Promise<string> => {
    const res = await fetch(`${BASE_URL}/acceptance/payment_keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            auth_token: params.authToken,
            expiration: 3600,
            order_id: params.paymobOrderId,
            amount_cents: params.amountCents,
            currency: 'EGP',
            integration_id: env('PAYMOB_CARD_INTEGRATION_ID'),
            billing_data: {
                first_name: params.billingData.firstName,
                last_name: params.billingData.lastName,
                email: params.billingData.email,
                phone_number: params.billingData.phoneNumber,
                apartment: 'NA',
                floor: 'NA',
                street: 'NA',
                building: 'NA',
                shipping_method: 'NA',
                postal_code: 'NA',
                city: 'NA',
                country: 'NA',
                state: 'NA',
            },
            redirection_url: params.redirectionUrl,
        }),
    })
    if (!res.ok) {
        throw new Error(`Paymob payment key failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json() as { token: string }
    return data.token
}

/**
 * Step 4 — build the iframe redirect URL the client opens to enter card details.
 */
export const buildPaymentUrl = (paymentToken: string): string => {
    return `${BASE_URL}/acceptance/iframes/${env('PAYMOB_IFRAME_ID')}?payment_token=${paymentToken}`
}

// The canonical field order Paymob uses when computing the HMAC signature.
const HMAC_FIELDS = [
    'amount_cents',
    'created_at',
    'currency',
    'error_occured',
    'has_parent_transaction',
    'id',
    'integration_id',
    'is_3d_secure',
    'is_auth',
    'is_capture',
    'is_refunded',
    'is_standalone_payment',
    'is_voided',
    'order.id',
    'owner',
    'pending',
    'source_data.pan',
    'source_data.sub_type',
    'source_data.type',
    'success',
]

/**
 * Verify the HMAC-SHA512 signature Paymob sends with every callback.
 * Returns true when the recomputed digest matches the received `hmac`.
 */
export const verifyCallbackHmac = (params: Record<string, any>, hmac: string): boolean => {
    const concatenated = HMAC_FIELDS
        .map(field => {
            let value: any
            const dotIndex = field.indexOf('.')
            if (dotIndex !== -1) {
                const parent = field.substring(0, dotIndex)
                const child = field.substring(dotIndex + 1)
                value = params[parent]?.[child]
            } else {
                value = params[field]
            }
            return value !== undefined && value !== null ? value : ''
        })
        .join('')
    const computed = crypto
        .createHmac('sha512', env('PAYMOB_HMAC_SECRET'))
        .update(concatenated, 'utf8')
        .digest('hex')
    // Timing-safe comparison to avoid oracle attacks.
    if (computed.length !== hmac.length) return false
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hmac, 'hex'))
}
