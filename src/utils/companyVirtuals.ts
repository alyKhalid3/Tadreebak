// Helper: apply Company virtuals (`googleMapsUrl` etc.) to a lean object.
//
// Mongoose 9 has no built-in support for `lean({ virtuals: true })` —
// the docs in `query.js` redirect users to the `mongoose-lean-virtuals`
// plugin. Instead, Mongoose 9 exposes `Model.applyVirtuals(obj, names)`
// which mutates a POJO to add the listed virtuals. We call it from the
// service layer right after `cacheWrap` returns so the cached response
// (cold or warm) carries `googleMapsUrl`.
//
// For populated subdocs (e.g. `internship.companyId` in the intern
// detail response), the nested-array `applyVirtuals` shape does NOT
// work because populated subdocs in lean mode are plain objects whose
// schema is the *ref* schema, not the parent's. We therefore have to
// detect the populated subdoc and call the Company model's applyVirtuals
// on it directly. This helper does that for both single docs and arrays.
import { companyModel } from "../DB/models/company.model";

const VIRTUALS = ["googleMapsUrl"] as const;

/**
 * Apply Company virtuals to a value that may be:
 *  - a single lean Company document
 *  - an array of lean Company documents
 *  - a lean document that has a populated `companyId` subdoc
 *  - an array of lean documents that each have a populated `companyId`
 *  - null / undefined (no-op)
 *
 * Mutates the input(s) in place — same semantics as Model.applyVirtuals.
 */
export function applyCompanyVirtuals<T>(value: T): T {
    if (value == null) return value;
    if (Array.isArray(value)) {
        for (const item of value) {
            applyOne(item);
        }
    } else {
        applyOne(value as any);
    }
    return value;
}

function applyOne(doc: any) {
    if (doc == null || typeof doc !== "object") return;
    // Direct Company document — the `location` field is a { lat, lng } object
    // when present, not the string enum used by the Internship model. Detect
    // the right shape so we don't accidentally treat an Internship as a
    // Company (both have a `location` field, but different types).
    if (isCompanyLocation(doc.location)) {
        companyModel.applyVirtuals(doc, [...VIRTUALS]);
        return;
    }
    // Populated subdoc — at minimum has the populated ObjectId's fields.
    // Mongoose leaves the original ref id as the parent; if the populate
    // ran, the field becomes the actual subdoc.
    if (doc.companyId && typeof doc.companyId === "object" && !Array.isArray(doc.companyId)) {
        companyModel.applyVirtuals(doc.companyId, [...VIRTUALS]);
    }
}

function isCompanyLocation(loc: unknown): boolean {
    // Company.location is a { lat: Number, lng: Number } subdoc; the
    // Internship.location is a string enum ("remote" / "on-site" / "hybrid").
    // We treat any non-null object as a Company location.
    return loc != null && typeof loc === "object" && !Array.isArray(loc)
}
