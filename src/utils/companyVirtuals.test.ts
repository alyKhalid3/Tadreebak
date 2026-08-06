// Regression test for the lean-virtuals fix on cached Company reads.
//
// Background: Mongoose 9 has no built-in support for `lean({ virtuals: true })`.
// Cached reads return plain POJOs without `googleMapsUrl`. The service layer
// has to call `Model.applyVirtuals` explicitly. This helper centralises that
// so a future change to the virtual name doesn't ripple through every call
// site.
//
// These tests use a stub object that mirrors the Company shape — we don't
// need a live Mongo connection because `applyCompanyVirtuals` is a pure
// function over the input value. It only requires `companyModel.applyVirtuals`
// to be a callable, which we mock by intercepting the function on the model.
import { test } from "node:test"
import assert from "node:assert/strict"
import { companyModel } from "../DB/models/company.model"
import { applyCompanyVirtuals } from "./companyVirtuals"

type AnyDoc = Record<string, any>

function stubApplyVirtuals() {
    // Replace applyVirtuals on the real model with a deterministic stub that
    // sets the requested virtual to a known value. We restore it at the end.
    const original = (companyModel as any).applyVirtuals
    let lastArgs: any = null
    ;(companyModel as any).applyVirtuals = (doc: AnyDoc, names: string[]) => {
        lastArgs = { doc, names }
        if (Array.isArray(doc)) {
            for (const d of doc) stubOne(d, names)
        } else {
            stubOne(doc, names)
        }
        return doc
    }
    return {
        getLast: () => lastArgs,
        restore: () => {
            ;(companyModel as any).applyVirtuals = original
        },
    }
}

function stubOne(doc: AnyDoc, names: string[]) {
    if (names.includes("googleMapsUrl")) {
        const { lat, lng } = doc?.location ?? {}
        doc.googleMapsUrl =
            typeof lat === "number" && typeof lng === "number"
                ? `https://maps.example/?q=${lat},${lng}`
                : undefined
    }
}

test("applyCompanyVirtuals adds googleMapsUrl to a single Company POJO", () => {
    const stub = stubApplyVirtuals()
    try {
        const doc: AnyDoc = { location: { lat: 30.0444, lng: 31.2357 }, name: "X" }
        const out = applyCompanyVirtuals(doc)
        assert.equal(out, doc, "should mutate and return same reference")
        assert.equal(
            doc.googleMapsUrl,
            "https://maps.example/?q=30.0444,31.2357",
            "should populate the maps URL from location",
        )
        assert.deepEqual(stub.getLast().names, ["googleMapsUrl"])
    } finally {
        stub.restore()
    }
})

test("applyCompanyVirtuals is a no-op on Company without coordinates", () => {
    const stub = stubApplyVirtuals()
    try {
        const doc: AnyDoc = { name: "X" }
        applyCompanyVirtuals(doc)
        assert.equal(doc.googleMapsUrl, undefined)
    } finally {
        stub.restore()
    }
})

test("applyCompanyVirtuals on a list applies to every item", () => {
    const stub = stubApplyVirtuals()
    try {
        const list: AnyDoc[] = [
            { name: "A", location: { lat: 1, lng: 2 } },
            { name: "B", location: { lat: 3, lng: 4 } },
            { name: "C" },
        ]
        const out = applyCompanyVirtuals(list)
        assert.equal(out, list)
        assert.equal(list[0]?.googleMapsUrl, "https://maps.example/?q=1,2")
        assert.equal(list[1]?.googleMapsUrl, "https://maps.example/?q=3,4")
        assert.equal(list[2]?.googleMapsUrl, undefined)
    } finally {
        stub.restore()
    }
})

test("applyCompanyVirtuals does not treat a string-`location` doc as a Company", () => {
    // The Internship model has `location: { type: String, enum: [...] }` so
    // a lean Internship POJO has `location: "remote"`. The helper must NOT
    // mistake that for a Company and call applyVirtuals on it (which would
    // try to read .lat / .lng off a string and return undefined silently).
    // Instead it should fall through to the populated-subdoc branch.
    const stub = stubApplyVirtuals()
    try {
        const internship: AnyDoc = {
            title: "Foo",
            location: "remote",
            companyId: { name: "Co", location: { lat: 9, lng: 9 } },
        }
        applyCompanyVirtuals(internship)
        assert.equal(
            "googleMapsUrl" in internship,
            false,
            "internship doc itself must not get googleMapsUrl",
        )
        assert.equal(
            internship.companyId.googleMapsUrl,
            "https://maps.example/?q=9,9",
            "but the populated companyId should still get the virtual",
        )
    } finally {
        stub.restore()
    }
})

test("applyCompanyVirtuals on a populated subdoc recurses into companyId", () => {
    const stub = stubApplyVirtuals()
    try {
        // Simulates an internship POJO with a populated `companyId` subdoc.
        // The doc itself has no `location` — we have to detect the subdoc
        // shape and apply the virtual to the subdoc instead.
        const internship: AnyDoc = {
            title: "Foo",
            companyId: { name: "Co", location: { lat: 5, lng: 6 } },
        }
        applyCompanyVirtuals(internship)
        assert.equal(
            internship.companyId.googleMapsUrl,
            "https://maps.example/?q=5,6",
            "subdoc should now carry googleMapsUrl",
        )
    } finally {
        stub.restore()
    }
})

test("applyCompanyVirtuals on an array of populated subdocs recurses per item", () => {
    const stub = stubApplyVirtuals()
    try {
        const list: AnyDoc[] = [
            { title: "A", companyId: { name: "CoA", location: { lat: 1, lng: 1 } } },
            { title: "B", companyId: { name: "CoB" } }, // no location
        ]
        applyCompanyVirtuals(list)
        assert.equal(list[0]?.companyId?.googleMapsUrl, "https://maps.example/?q=1,1")
        assert.equal(list[1]?.companyId?.googleMapsUrl, undefined)
    } finally {
        stub.restore()
    }
})

test("applyCompanyVirtuals leaves an unpopulated ObjectId companyId alone", () => {
    const stub = stubApplyVirtuals()
    try {
        // When the populate hasn't run, companyId is still a string/ObjectId.
        // typeof check must skip it without throwing.
        const internship: AnyDoc = {
            title: "Foo",
            companyId: "6ab1c2d3e4f5a6b7c8d9e0f1",
        }
        applyCompanyVirtuals(internship)
        assert.equal(typeof internship.companyId, "string")
        assert.equal("googleMapsUrl" in internship, false)
    } finally {
        stub.restore()
    }
})

test("applyCompanyVirtuals handles null / undefined without throwing", () => {
    const stub = stubApplyVirtuals()
    try {
        assert.equal(applyCompanyVirtuals(null as any), null)
        assert.equal(applyCompanyVirtuals(undefined as any), undefined)
        assert.deepEqual(applyCompanyVirtuals([] as any[]), [])
    } finally {
        stub.restore()
    }
})
