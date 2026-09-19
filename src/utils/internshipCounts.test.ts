import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeApplicantsCount } from "./internshipCounts";

// ---------------------------------------------------------------------------
// mergeApplicantsCount
// ---------------------------------------------------------------------------

test("mergeApplicantsCount: zero counts → every internship gets 0", () => {
    const internships = [{ _id: 'a' }, { _id: 'b' }]
    const result = mergeApplicantsCount(internships, [])
    assert.equal(result[0]?.applicantsCount, 0)
    assert.equal(result[1]?.applicantsCount, 0)
})

test("mergeApplicantsCount: matching counts are merged in place", () => {
    const internships = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]
    const counts = [
        { _id: 'a', count: 7 },
        { _id: 'b', count: 3 },
    ]
    const result = mergeApplicantsCount(internships, counts)
    assert.equal(result[0]?.applicantsCount, 7)
    assert.equal(result[1]?.applicantsCount, 3)
    assert.equal(result[2]?.applicantsCount, 0)
})

test("mergeApplicantsCount: preserves the internship order", () => {
    const internships = [{ _id: 'z' }, { _id: 'a' }, { _id: 'm' }]
    const counts = [
        { _id: 'a', count: 5 },
        { _id: 'z', count: 2 },
    ]
    const result = mergeApplicantsCount(internships, counts)
    assert.equal(result[0]?.applicantsCount, 2)
    assert.equal(result[1]?.applicantsCount, 5)
    assert.equal(result[2]?.applicantsCount, 0)
})

test("mergeApplicantsCount: keeps all original fields", () => {
    const internships = [
        { _id: 'a', title: 'Backend Intern', closed: false },
    ]
    const counts = [{ _id: 'a', count: 4 }]
    const result = mergeApplicantsCount(internships, counts)
    assert.equal(result[0]?.title, 'Backend Intern')
    assert.equal(result[0]?.closed, false)
    assert.equal(result[0]?.applicantsCount, 4)
})

test("mergeApplicantsCount: missing count key is 0, not undefined", () => {
    // The frontend renders the number unconditionally; we never
    // want undefined on the wire.
    const internships = [{ _id: 'a' }]
    const result = mergeApplicantsCount(internships, [
        { _id: 'other', count: 9 },
    ])
    assert.equal(result[0]?.applicantsCount, 0)
})

test("mergeApplicantsCount: count of 0 is preserved (not treated as 'missing')", () => {
    // A 0 should not collapse to undefined and then default
    // back to 0 — it should stay 0 explicitly.
    const internships = [{ _id: 'a' }]
    const result = mergeApplicantsCount(internships, [
        { _id: 'a', count: 0 },
    ])
    assert.equal(result[0]?.applicantsCount, 0)
})

test("mergeApplicantsCount: tolerates ObjectId-shaped _id on the count side", () => {
    // ApplicationModel.aggregate returns `_id` as a real ObjectId
    // (or hex string after a $toString stage). Stringify on
    // both sides so the Map lookup always matches.
    const obj = { toString: () => '6ab1d2e3f4a5b6c7d8e9f0a1' }
    const internships = [{ _id: '6ab1d2e3f4a5b6c7d8e9f0a1' }]
    const counts = [{ _id: obj, count: 12 }]
    const result = mergeApplicantsCount(internships, counts)
    assert.equal(result[0]?.applicantsCount, 12)
})

test("mergeApplicantsCount: empty input → empty output", () => {
    const result = mergeApplicantsCount([], [])
    assert.equal(result.length, 0)
    assert.deepEqual(result, [])
})

test("mergeApplicantsCount: tolerates undefined count values defensively", () => {
    // If Mongoose ever returns a malformed entry, fall back to 0
    // rather than crashing the whole list endpoint.
    const internships = [{ _id: 'a' }, { _id: 'b' }]
    const counts = [
        { _id: 'a', count: undefined as unknown as number },
        { _id: 'b' } as any,
    ]
    const result = mergeApplicantsCount(internships, counts)
    assert.equal(result[0]?.applicantsCount, 0)
    assert.equal(result[1]?.applicantsCount, 0)
})
