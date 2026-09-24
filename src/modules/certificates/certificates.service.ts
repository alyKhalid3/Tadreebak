// Phase 17 / P5 #11 — Certificate verification service.
//
// Public endpoint: `GET /certificates/:code` returns either a
// verified public certificate projection or `{ valid: false }`.
// The verification is HMAC-based: we never trust the caller, we
// re-sign and re-check against the configured secret, then look
// the application up in the DB as the canonical source of truth.
//
// Privacy:
//   - The shape returned is intentionally narrow: first name +
//     last initial for the student, internship title, company
//     name + logo URL. No email, no full last name, no internal
//     IDs.
//   - `valid: false` is returned for every failure mode (bad
//     signature, malformed code, unknown application, not-yet-
//     completed application, deleted application) — collapsing
//     the failure surface prevents an attacker from fingerprinting
//     which dimension failed.
import mongoose from "mongoose"
import { ApplicationModel } from "../../DB/models/application.model"
import { InternShipModel } from "../../DB/models/internship.model"
import { UserModel } from "../../DB/models/user.model"
import { companyModel } from "../../DB/models/company.model"
import {
    buildPublicCertificate,
    mintCertificateCode,
    verifyCertificateCodeSignature,
    type PublicCertificate,
} from "../../utils/certificateCode"

const getSecret = (): string => {
    const secret = process.env.CERTIFICATE_SECRET?.trim()
    if (secret) return secret
    // Deterministic dev fallback so the endpoint is exercisable
    // without env wiring. Production deployments MUST set
    // CERTIFICATE_SECRET — log loudly via Sentry-friendly error
    // path if it's missing.
    return "tadreebak-dev-certificate-secret-change-me"
}

export class CertificateService {
    /**
     * Mint a verification code for a freshly completed application.
     * Called from `application.service.markCompleted` so the UI can
     * render a sharable URL (`<origin>/certificate?code=...`) the
     * moment the company's "mark completed" call succeeds.
     *
     * Pure call into `mintCertificateCode(appId, secret)` — the
     * secret is read here so callers don't need to thread env
     * vars through.
     */
    mintForApplication(appId: string): string {
        return mintCertificateCode(appId, getSecret())
    }

    /**
     * Public verification path. Always returns `successHandler`
     * with 200 — even failures — because the UX contract is
     * "this URL either proves the certificate or it doesn't",
     * not "404 this resource".
     *
     * On any failure mode (forged signature, tampered payload,
     * unknown app, app not completed, app deleted) we return
     * `{ valid: false }`. The cryptographic check happens first
     * (cheap) before the DB roundtrip (expensive), so a flood of
     * forged codes never touches MongoDB.
     */
    async verify(code: string): Promise<PublicCertificate | { valid: false }> {
        const sigCheck = verifyCertificateCodeSignature(code, getSecret())
        if (!sigCheck.ok) {
            return { valid: false }
        }
        if (!mongoose.isObjectIdOrHexString(sigCheck.appId)) {
            return { valid: false }
        }

        // Look up the full chain in one round trip via $lookup so
        // a single hot path doesn't fan out into 4 queries. We
        // intentionally use `.lean()` — no virtuals are needed
        // and we want the raw objects so we can project the
        // narrow public shape ourselves.
        const rows = await ApplicationModel.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(sigCheck.appId) } },
            {
                $lookup: {
                    from: InternShipModel.collection.name,
                    localField: "internshipId",
                    foreignField: "_id",
                    as: "internship",
                },
            },
            { $unwind: { path: "$internship", preserveNullAndEmptyArrays: false } },
            {
                $lookup: {
                    from: UserModel.collection.name,
                    localField: "studentId",
                    foreignField: "_id",
                    as: "student",
                },
            },
            { $unwind: { path: "$student", preserveNullAndEmptyArrays: false } },
            {
                $lookup: {
                    from: companyModel.collection.name,
                    localField: "internship.companyId",
                    foreignField: "_id",
                    as: "company",
                },
            },
            { $unwind: { path: "$company", preserveNullAndEmptyArrays: false } },
            {
                $project: {
                    completed: 1,
                    completedAt: 1,
                    "student.firstName": 1,
                    "student.lastName": 1,
                    "internship.title": 1,
                    "company.name": 1,
                    "company.logo": 1,
                },
            },
        ])

        const row = rows[0]
        if (!row || !row.completed || !row.completedAt) {
            // App is missing OR not yet completed (forge with a
            // real appId that's still pending) — same response.
            return { valid: false }
        }

        return buildPublicCertificate({
            student: {
                firstName: row.student?.firstName,
                lastName: row.student?.lastName,
            },
            internship: { title: row.internship?.title },
            company: { name: row.company?.name, logo: row.company?.logo },
            completedAt: row.completedAt,
        })
    }
}

export const certificateService = new CertificateService()