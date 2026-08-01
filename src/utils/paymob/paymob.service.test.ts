import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// The verifyCallbackHmac function reads from process.env.PAYMOB_HMAC_SECRET
// at call time, so we set it BEFORE importing the module.
process.env.PAYMOB_HMAC_SECRET = "test_hmac_secret_for_unit_tests";

const { verifyCallbackHmac } = await import("./paymob.service");

// Helper: build a Paymob-style callback object and its expected HMAC.
const sign = (params: Record<string, any>, secret: string) => {
    const HMAC_FIELDS = [
        'amount_cents', 'created_at', 'currency', 'error_occured',
        'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure',
        'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
        'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan',
        'source_data.sub_type', 'source_data.type', 'success',
    ];
    const concatenated = HMAC_FIELDS.map((field) => {
        const dot = field.indexOf('.');
        if (dot !== -1) {
            const p = field.substring(0, dot);
            const c = field.substring(dot + 1);
            const v = (params as any)[p]?.[c];
            return v !== undefined && v !== null ? v : "";
        }
        const v = (params as any)[field];
        return v !== undefined && v !== null ? v : "";
    }).join('');
    return crypto.createHmac("sha512", secret).update(concatenated, "utf8").digest("hex");
};

test("verifyCallbackHmac accepts a correctly signed payload", () => {
    const params = {
        amount_cents: "50000",
        created_at: "2024-01-01T00:00:00Z",
        currency: "EGP",
        error_occured: "false",
        has_parent_transaction: "false",
        id: "12345",
        integration_id: "5772720",
        is_3d_secure: "true",
        is_auth: "false",
        is_capture: "false",
        is_refunded: "false",
        is_standalone_payment: "true",
        is_voided: "false",
        order: { id: "999" },
        owner: "1",
        pending: "false",
        source_data: { pan: "4111", sub_type: "Visa", type: "card" },
        success: "true",
    };
    const hmac = sign(params, "test_hmac_secret_for_unit_tests");
    assert.equal(verifyCallbackHmac(params, hmac), true);
});

test("verifyCallbackHmac rejects a tampered payload", () => {
    const params = {
        amount_cents: "50000",
        success: "true",
        order: { id: "999" },
        // ... minimal fields; HMAC only signs what's in HMAC_FIELDS.
        created_at: "x", currency: "EGP", error_occured: "false",
        has_parent_transaction: "false", id: "1", integration_id: "1",
        is_3d_secure: "false", is_auth: "false", is_capture: "false",
        is_refunded: "false", is_standalone_payment: "false", is_voided: "false",
        owner: "1", pending: "false", source_data: { pan: "x", sub_type: "x", type: "x" },
    };
    const goodHmac = sign(params, "test_hmac_secret_for_unit_tests");
    // Tamper with success
    const tampered = { ...params, success: "false" };
    assert.equal(verifyCallbackHmac(tampered, goodHmac), false);
});

test("verifyCallbackHmac rejects a wrong-length hmac (timing safety)", () => {
    assert.equal(verifyCallbackHmac({ success: "true" }, "deadbeef"), false);
});
