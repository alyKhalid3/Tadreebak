// Centralised feature flags. Read from env at first call, then memoised
// for the lifetime of the process. Restart the server to flip a flag.
//
// Convention: every flag is ON by default. To turn one off, set the env
// var to "false" / "0" / "". Anything else is treated as true.
// `BILLING_ENABLED=false` keeps the billing API mounted but every
// endpoint returns 503, and the credit check in intern creation is
// bypassed (so companies can keep posting without spending credits).

let _billingEnabled: boolean | null = null

export function isBillingEnabled(): boolean {
    if (_billingEnabled === null) {
        const v = (process.env.BILLING_ENABLED ?? "true").trim().toLowerCase()
        _billingEnabled = v !== "false" && v !== "0"
    }
    return _billingEnabled
}

/**
 * Test-only: clear the memoised flag so the next `isBillingEnabled()` call
 * re-reads `process.env`. Not exported from the package barrel; tests
 * import this module directly.
 */
export function __resetFeatureFlagsForTests(): void {
    _billingEnabled = null
}

/**
 * Express middleware: short-circuits every downstream handler with a 503
 * when billing is disabled. Apply once at the router level so individual
 * route definitions stay unchanged.
 */
export const requireBillingEnabled: import("express").RequestHandler = (_req, res, next) => {
    if (!isBillingEnabled()) {
        return res.status(503).json({
            errMsg: "Billing is temporarily disabled",
            cause: 503,
        })
    }
    next()
}
