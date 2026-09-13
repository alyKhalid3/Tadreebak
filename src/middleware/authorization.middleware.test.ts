// Unit tests for the role guards in src/middleware/authorization.middleware.ts.
//
// Two guards are tested:
//   1. AuthZMiddleware (allowed: UserRoleEnum[]) — the role-based gate.
//      Used everywhere a route restricts by role (e.g. company-owner
//      dashboard endpoints).
//   2. requireIntern() — the Phase 3 helper (Phase 5 update). Accepts
//      a user with `role === INTERN` OR at least one ACTIVE entry in
//      `enrollments[]`. The enrollments fallback is critical for the
//      "accepted, JWT still says STUDENT" window — we trust the DB-side
//      enrollments[] over the JWT's role claim.

import { test } from "node:test"
import assert from "node:assert/strict"
import { AuthZMiddleware, requireIntern } from "./authorization.middleware"
import { UserRoleEnum } from "../DB/types/user.type"

// We don't need a real Express req/res — just enough to populate
// `res.locals.user`. The middleware only reads `res.locals.user`.
const fakeRes = (user: any) =>
    ({
        locals: { user },
        status(code: number) {
            this.statusCode = code
            return this
        },
        json(body: any) {
            this.body = body
            return this
        },
    }) as any

// ----- AuthZMiddleware: admin gating -----
test("AuthZMiddleware allows admin to access admin-only routes", () => {
    const res = fakeRes({ role: UserRoleEnum.ADMIN })
    let nextCalled = false
    AuthZMiddleware([UserRoleEnum.ADMIN])({} as any, res, (() => {
        nextCalled = true
    }) as any)
    assert.equal(nextCalled, true)
    assert.equal(res.statusCode, undefined)
})
test("AuthZMiddleware blocks student from admin routes", () => {
    const res = fakeRes({ role: UserRoleEnum.STUDENT })
    AuthZMiddleware([UserRoleEnum.ADMIN])({} as any, res, (() => {}) as any)
    assert.equal(res.statusCode, 403)
})
test("AuthZMiddleware blocks company_owner from admin routes", () => {
    const res = fakeRes({ role: UserRoleEnum.COMPANY_OWNER })
    AuthZMiddleware([UserRoleEnum.ADMIN])({} as any, res, (() => {}) as any)
    assert.equal(res.statusCode, 403)
})

// ----- AuthZMiddleware: company_owner gating (the dashboard side) -----
test("AuthZMiddleware allows company_owner to access company routes", () => {
    const res = fakeRes({ role: UserRoleEnum.COMPANY_OWNER })
    let nextCalled = false
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER])({} as any, res, (() => {
        nextCalled = true
    }) as any)
    assert.equal(nextCalled, true)
})
test("AuthZMiddleware allows admin to access company routes when admin is in the allow-list", () => {
    // Admin is treated as a superset for debugging/support.
    // If we change this, this test will fail loudly.
    const res = fakeRes({ role: UserRoleEnum.ADMIN })
    let nextCalled = false
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER, UserRoleEnum.ADMIN])(
        {} as any,
        res,
        (() => {
            nextCalled = true
        }) as any,
    )
    assert.equal(nextCalled, true)
})
test("AuthZMiddleware blocks student from company routes (the C5 bug fix)", () => {
    const res = fakeRes({ role: UserRoleEnum.STUDENT })
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER])({} as any, res, (() => {}) as any)
    assert.equal(res.statusCode, 403)
})
test("AuthZMiddleware blocks intern from company routes", () => {
    const res = fakeRes({ role: UserRoleEnum.INTERN })
    AuthZMiddleware([UserRoleEnum.COMPANY_OWNER])({} as any, res, (() => {}) as any)
    assert.equal(res.statusCode, 403)
})

// ----- AuthZMiddleware: intern gating (sanity; requireIntern is the real one) -----
test("AuthZMiddleware allows intern with explicit INTERN allow-list", () => {
    const res = fakeRes({ role: UserRoleEnum.INTERN })
    let nextCalled = false
    AuthZMiddleware([UserRoleEnum.INTERN])({} as any, res, (() => {
        nextCalled = true
    }) as any)
    assert.equal(nextCalled, true)
})
test("AuthZMiddleware blocks student even with INTERN allow-list (stale-role check is requireIntern's job)", () => {
    // This is the C5 subtlety: AuthZMiddleware checks role ONLY,
    // and a student with an active enrollment is NOT automatically
    // admitted by the role-based gate. requireIntern() is the right
    // helper for intern endpoints.
    const fakeEnrollment = {
        _id: "6ab1c2d3e4f5a6b7c8d9e0f1",
        companyId: "6ab1c2d3e4f5a6b7c8d9e0aa",
        status: "active",
        enrolledAt: new Date(),
        internshipStartDate: new Date(),
        internshipEndDate: null,
        totalPoints: 0,
    }
    const res = fakeRes({ role: UserRoleEnum.STUDENT, enrollments: [fakeEnrollment] })
    let nextCalled = false
    AuthZMiddleware([UserRoleEnum.INTERN])({} as any, res, (() => {
        nextCalled = true
    }) as any)
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 403)
})

// ----- AuthZMiddleware: multi-role allow-list -----
test("AuthZMiddleware allows any role in a multi-role allow-list", () => {
    const allowed = [UserRoleEnum.STUDENT, UserRoleEnum.INTERN]
    for (const role of allowed) {
        const res = fakeRes({ role })
        let nextCalled = false
        AuthZMiddleware(allowed)({} as any, res, (() => {
            nextCalled = true
        }) as any)
        assert.equal(nextCalled, true, `${role} should be allowed`)
    }
})
test("AuthZMiddleware blocks roles not in a multi-role allow-list", () => {
    const allowed = [UserRoleEnum.STUDENT, UserRoleEnum.INTERN]
    for (const role of [UserRoleEnum.ADMIN, UserRoleEnum.COMPANY_OWNER]) {
        const res = fakeRes({ role })
        AuthZMiddleware(allowed)({} as any, res, (() => {}) as any)
        assert.equal(res.statusCode, 403, `${role} should be blocked`)
    }
})

// ----- AuthZMiddleware: fail-closed when user is missing -----
test("AuthZMiddleware fails closed with InvalidTokenException when user is missing", () => {
    // `auth()` was forgotten in the chain. Must not crash on
    // `undefined.role` — must pass an error to next() so the
    // global handler returns 401.
    const res = fakeRes(undefined)
    let nextErr: any = undefined
    AuthZMiddleware([UserRoleEnum.STUDENT])(
        {} as any,
        res,
        ((err?: any) => {
            nextErr = err
        }) as any,
    )
    assert.ok(nextErr, "should call next(err) when user is missing")
    assert.match(nextErr.message, /Authentication required/)
})

// ============================================================
// requireIntern — the Phase 3 helper
// ============================================================

test("requireIntern allows a user whose role is INTERN", () => {
    const res = fakeRes({ role: UserRoleEnum.INTERN })
    let nextCalled = false
    requireIntern()({} as any, res, (() => {
        nextCalled = true
    }) as any)
    assert.equal(nextCalled, true)
})

test("requireIntern allows a user who has an active enrollment (stale role fallback)", () => {
    // Phase 5: the fallback is now `enrollments[]`, not `enrolledAt`.
    // The application.service accept flow pushes a new active
    // enrollment into enrollments[] AND sets role: INTERN. If a
    // user's JWT still says STUDENT but the DB already has them as
    // an active intern, requireIntern must admit them. This is the
    // "accepted, JWT still says STUDENT" window.
    const fakeEnrollment = {
        _id: "6ab1c2d3e4f5a6b7c8d9e0f1",
        companyId: "6ab1c2d3e4f5a6b7c8d9e0aa",
        status: "active",
        enrolledAt: new Date(),
        internshipStartDate: new Date(),
        internshipEndDate: null,
        totalPoints: 0,
    }
    const res = fakeRes({ role: UserRoleEnum.STUDENT, enrollments: [fakeEnrollment] })
    let nextCalled = false
    requireIntern()({} as any, res, (() => {
        nextCalled = true
    }) as any)
    assert.equal(nextCalled, true, "stale-role user with active enrollment must be admitted")
})

test("requireIntern rejects a user with neither role INTERN nor enrolledAt", () => {
    const res = fakeRes({ role: UserRoleEnum.STUDENT })
    let nextCalled = false
    requireIntern()({} as any, res, (() => {
        nextCalled = true
    }) as any)
    assert.equal(nextCalled, false, "should not call next() — should respond 403")
    assert.equal(res.statusCode, 403)
    assert.match(res.body.message, /Intern access only/)
})

test("requireIntern rejects a user with role: company_owner (not an intern)", () => {
    const res = fakeRes({ role: UserRoleEnum.COMPANY_OWNER })
    let nextCalled = false
    requireIntern()({} as any, res, (() => {
        nextCalled = true
    }) as any)
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 403)
})

test("requireIntern fails closed when res.locals.user is missing", () => {
    // `auth()` was forgotten in the chain. The middleware must not
    // crash on `undefined.role` — it should pass an InvalidToken
    // error to next() so the global handler returns 401.
    const res = fakeRes(undefined)
    let nextErr: any = undefined
    requireIntern()(
        {} as any,
        res,
        ((err?: any) => {
            nextErr = err
        }) as any,
    )
    assert.ok(nextErr, "should call next(err) when user is missing")
    assert.match(nextErr.message, /Authentication required/)
})

test("requireIntern treats enrolledAt: undefined as not enrolled (nullish semantics)", () => {
    // Defensive: a user with role=STUDENT and enrolledAt=undefined
    // must still be rejected. The `!!` coercion handles this.
    const res = fakeRes({ role: UserRoleEnum.STUDENT, enrolledAt: undefined })
    let nextCalled = false
    requireIntern()({} as any, res, (() => {
        nextCalled = true
    }) as any)
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 403)
})
