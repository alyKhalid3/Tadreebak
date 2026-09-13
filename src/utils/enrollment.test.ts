// Tests for the enrollment helpers (Phase 5).
//
// These helpers are the single point of truth for "does this user
// have an enrollment at this company?" — every service goes through
// them. Pinning the behavior here is what makes the multi-company
// refactor safe.

import { test } from "node:test"
import assert from "node:assert/strict"
import { Types } from "mongoose"
import {
    findActiveEnrollmentAt,
    findAnyEnrollmentAt,
    hasAnyActiveEnrollment,
    hasActiveEnrollmentAt,
    hasAnyEnrollmentAt,
    buildNewEnrollment,
    projectEnrollment,
    enrollmentFromLegacyFields,
} from "./enrollment"
import { EnrollmentStatus, IEnrollment, IUser } from "../DB/types/user.type"

const C1 = "6ab1c2d3e4f5a6b7c8d9e0f1"
const C2 = "6ab1c2d3e4f5a6b7c8d9e0f2"

const mkEnrollment = (
    companyId: string,
    status: EnrollmentStatus = EnrollmentStatus.ACTIVE,
): IEnrollment => ({
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(companyId),
    status,
    enrolledAt: new Date("2026-01-01"),
    internshipStartDate: new Date("2026-01-01"),
    internshipEndDate: null,
    totalPoints: 0,
})

const mkUser = (enrollments: IEnrollment[] = []): Pick<IUser, "enrollments"> => ({
    enrollments,
})

// ----- findActiveEnrollmentAt -----
test("findActiveEnrollmentAt returns the active enrollment at the company", () => {
    const user = mkUser([mkEnrollment(C1), mkEnrollment(C2)])
    const e = findActiveEnrollmentAt(user, C1)
    assert.ok(e)
    assert.equal(e!.companyId.toString(), C1)
})

test("findActiveEnrollmentAt returns null when the user has no enrollment at the company", () => {
    const user = mkUser([mkEnrollment(C1)])
    assert.equal(findActiveEnrollmentAt(user, C2), null)
})

test("findActiveEnrollmentAt ignores completed enrollments", () => {
    const user = mkUser([mkEnrollment(C1, EnrollmentStatus.COMPLETED)])
    assert.equal(findActiveEnrollmentAt(user, C1), null)
})

test("findActiveEnrollmentAt ignores withdrawn enrollments", () => {
    const user = mkUser([mkEnrollment(C1, EnrollmentStatus.WITHDRAWN)])
    assert.equal(findActiveEnrollmentAt(user, C1), null)
})

test("findActiveEnrollmentAt returns null when enrollments[] is empty", () => {
    assert.equal(findActiveEnrollmentAt(mkUser([]), C1), null)
})

test("findActiveEnrollmentAt accepts a string or ObjectId for companyId", () => {
    const user = mkUser([mkEnrollment(C1)])
    assert.ok(findActiveEnrollmentAt(user, new Types.ObjectId(C1)))
    assert.ok(findActiveEnrollmentAt(user, C1))
})

// ----- findAnyEnrollmentAt -----
test("findAnyEnrollmentAt returns completed enrollments too", () => {
    const user = mkUser([mkEnrollment(C1, EnrollmentStatus.COMPLETED)])
    assert.ok(findAnyEnrollmentAt(user, C1))
})

test("findAnyEnrollmentAt returns withdrawn enrollments too", () => {
    const user = mkUser([mkEnrollment(C1, EnrollmentStatus.WITHDRAWN)])
    assert.ok(findAnyEnrollmentAt(user, C1))
})

// ----- hasAnyActiveEnrollment -----
test("hasAnyActiveEnrollment is true when at least one is active", () => {
    const user = mkUser([
        mkEnrollment(C1, EnrollmentStatus.COMPLETED),
        mkEnrollment(C2, EnrollmentStatus.ACTIVE),
    ])
    assert.equal(hasAnyActiveEnrollment(user), true)
})

test("hasAnyActiveEnrollment is false when all are completed", () => {
    const user = mkUser([mkEnrollment(C1, EnrollmentStatus.COMPLETED)])
    assert.equal(hasAnyActiveEnrollment(user), false)
})

test("hasAnyActiveEnrollment is false when enrollments[] is empty", () => {
    assert.equal(hasAnyActiveEnrollment(mkUser([])), false)
})

// ----- hasActiveEnrollmentAt -----
test("hasActiveEnrollmentAt returns true for the right company only", () => {
    const user = mkUser([mkEnrollment(C1)])
    assert.equal(hasActiveEnrollmentAt(user, C1), true)
    assert.equal(hasActiveEnrollmentAt(user, C2), false)
})

// ----- hasAnyEnrollmentAt -----
test("hasAnyEnrollmentAt returns true for any status (active / completed / withdrawn)", () => {
    for (const status of [
        EnrollmentStatus.ACTIVE,
        EnrollmentStatus.COMPLETED,
        EnrollmentStatus.WITHDRAWN,
    ]) {
        const user = mkUser([mkEnrollment(C1, status)])
        assert.equal(hasAnyEnrollmentAt(user, C1), true, `should be true for ${status}`)
    }
})

test("hasAnyEnrollmentAt returns false when the user has no enrollment at the company", () => {
    const user = mkUser([mkEnrollment(C1)])
    assert.equal(hasAnyEnrollmentAt(user, C2), false)
})

// ----- buildNewEnrollment -----
test("buildNewEnrollment creates an active enrollment with the right companyId", () => {
    const e = buildNewEnrollment(C1)
    assert.equal(e.companyId.toString(), C1)
    assert.equal(e.status, EnrollmentStatus.ACTIVE)
    assert.equal(e.totalPoints, 0)
    assert.equal(e.internshipEndDate, null)
})

test("buildNewEnrollment sets enrolledAt and internshipStartDate to now by default", () => {
    const before = Date.now()
    const e = buildNewEnrollment(C1)
    const after = Date.now()
    assert.ok(e.enrolledAt.getTime() >= before)
    assert.ok(e.enrolledAt.getTime() <= after)
    assert.ok(e.internshipStartDate.getTime() >= before)
    assert.ok(e.internshipStartDate.getTime() <= after)
})

test("buildNewEnrollment accepts an explicit internshipStartDate and internshipEndDate", () => {
    const start = new Date("2026-06-01")
    const end = new Date("2026-09-01")
    const e = buildNewEnrollment(C1, start, end)
    assert.equal(e.internshipStartDate.getTime(), start.getTime())
    assert.equal(e.internshipEndDate?.getTime(), end.getTime())
})

// ----- projectEnrollment -----
test("projectEnrollment returns the IEnrollment fields", () => {
    const e = mkEnrollment(C1)
    const proj = projectEnrollment(e)
    assert.equal(proj.companyId.toString(), C1)
    assert.equal(proj.status, EnrollmentStatus.ACTIVE)
})

// ----- enrollmentFromLegacyFields -----
test("enrollmentFromLegacyFields returns null when enrollmentCompanyId is missing", () => {
    assert.equal(enrollmentFromLegacyFields({}), null)
})

test("enrollmentFromLegacyFields builds an ACTIVE enrollment from the legacy fields", () => {
    const legacy: any = {
        enrollmentCompanyId: new Types.ObjectId(C1),
        enrolledAt: new Date("2026-01-01"),
        internshipStartDate: new Date("2026-01-01"),
        internshipEndDate: null,
        totalPoints: 50,
    }
    const e = enrollmentFromLegacyFields(legacy)
    assert.ok(e)
    assert.equal(e!.companyId.toString(), C1)
    assert.equal(e!.status, EnrollmentStatus.ACTIVE)
    assert.equal(e!.totalPoints, 50)
})

test("enrollmentFromLegacyFields defaults missing fields safely", () => {
    const legacy: any = {
        enrollmentCompanyId: new Types.ObjectId(C1),
    }
    const e = enrollmentFromLegacyFields(legacy)
    assert.ok(e)
    assert.equal(e!.status, EnrollmentStatus.ACTIVE)
    assert.equal(e!.totalPoints, 0)
    assert.equal(e!.internshipEndDate, null)
})
