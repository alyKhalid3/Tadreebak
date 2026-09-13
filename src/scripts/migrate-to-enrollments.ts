// Phase 5 — one-time migration: backfill `user.enrollments[]` from the
// legacy single-company fields (`enrollmentCompanyId`, `enrolledAt`,
// `internshipStartDate`, `internshipEndDate`, `totalPoints`).
//
// Why: the new code reads from `enrollments[]`. Before this script
// runs, every user that was an intern at one company (the only mode
// the old code allowed) has the legacy fields populated but
// `enrollments` empty. After this script runs, `enrollments[]` has
// one ACTIVE entry per legacy intern, and the read-side helpers in
// `src/utils/enrollment.ts` work without needing the legacy fallback.
//
// Idempotency:
//   - Only users with `enrollments` EMPTY/MISSING are touched.
//   - Users who are already on the new system (have any
//     `enrollments[]` entry) are skipped.
//   - The legacy fields are left intact as a safety net for one
//     release. They will be dropped in a follow-up PR.
//
// Usage:
//   npx tsx src/scripts/migrate-to-enrollments.ts
//   (uses MONGO_URI from src/config/.env)
//
//   npx tsx src/scripts/migrate-to-enrollments.ts --dry-run
//   (logs what WOULD happen, makes no changes)
//
// Safe to re-run.

import mongoose, { Types } from "mongoose"
import dotenv from "dotenv"
import path from "path"
import { enrollmentFromLegacyFields } from "../utils/enrollment"
import { EnrollmentStatus, type IEnrollment, type IUser } from "../DB/types/user.type"

dotenv.config({ path: path.resolve("./src/config/.env") })

const dryRun = process.argv.includes("--dry-run")
const uri = process.env.MONGO_URI

if (!uri || !uri.trim()) {
    console.error("No MongoDB URI. Set MONGO_URI in src/config/.env or pass --uri \"...\".")
    process.exit(1)
}

// What the cursor returns for each user. `IUser` doesn't have an
// `_id` field (Mongoose adds it implicitly), so we model the shape
// we actually want to read.
type LegacyUser = {
    _id: Types.ObjectId
    enrollmentCompanyId?: Types.ObjectId
    enrolledAt?: Date
    internshipStartDate?: Date
    internshipEndDate?: Date | null
    totalPoints?: number
    enrollments?: IEnrollment[]
}

const isMissingOrEmpty = (arr: any): boolean =>
    !arr || (Array.isArray(arr) && arr.length === 0)

const run = async (): Promise<void> => {
    console.log(`[migrate-to-enrollments] dry-run=${dryRun}`)
    console.log("[migrate-to-enrollments] connecting…")
    const connection = await mongoose.connect(uri as string, {
        serverSelectionTimeoutMS: 10_000,
    })

    let scanned = 0
    let migrated = 0
    let skippedAlreadyOnNew = 0
    let skippedNoLegacy = 0
    let errors = 0

    try {
        const users = connection.connection.db!.collection("users")

        // Only the fields we need; large user docs would otherwise
        // chew memory on a sizable install.
        const cursor = users.find(
            { enrollmentCompanyId: { $exists: true, $ne: null } },
            {
                projection: {
                    _id: 1,
                    enrollmentCompanyId: 1,
                    enrolledAt: 1,
                    internshipStartDate: 1,
                    internshipEndDate: 1,
                    totalPoints: 1,
                    enrollments: 1,
                },
            },
        )

        for await (const raw of cursor) {
            scanned += 1
            const user = raw as unknown as LegacyUser

            // Already on the new system — skip.
            if (!isMissingOrEmpty(user.enrollments)) {
                skippedAlreadyOnNew += 1
                continue
            }
            // No legacy enrollmentCompanyId — should not happen
            // because of the find filter, but guard anyway.
            if (!user.enrollmentCompanyId) {
                skippedNoLegacy += 1
                continue
            }

            const enrollment = enrollmentFromLegacyFields(user)
            if (!enrollment) {
                skippedNoLegacy += 1
                continue
            }

            // Stamp a fresh _id on the new subdoc. The user model's
            // schema has auto:true for this, but we're using the
            // raw collection (no schema), so we set it ourselves.
            const newEnrollment: IEnrollment = {
                _id: new Types.ObjectId(),
                companyId: enrollment.companyId,
                status: EnrollmentStatus.ACTIVE,
                enrolledAt: enrollment.enrolledAt,
                internshipStartDate: enrollment.internshipStartDate,
                internshipEndDate: enrollment.internshipEndDate ?? null,
                totalPoints: enrollment.totalPoints ?? 0,
            }

            if (dryRun) {
                console.log(
                    `  would migrate user ${user._id} (${user.enrollmentCompanyId.toString()})`,
                )
                migrated += 1
                continue
            }

            try {
                // The `enrollments: { $in: [null, undefined] }` clause
                // is a defensive check — we already verified the
                // array was empty in the cursor loop, but two
                // concurrent migrations could race otherwise. The
                // typed MongoDB driver doesn't express this exact
                // shape so we cast to any.
                const r = await users.updateOne(
                    {
                        _id: user._id,
                        enrollments: { $in: [null, undefined] },
                    } as any,
                    { $push: { enrollments: newEnrollment } } as any,
                )
                if (r.modifiedCount === 1) {
                    migrated += 1
                } else {
                    // Another process raced us; treat as skipped.
                    skippedAlreadyOnNew += 1
                }
            } catch (err) {
                errors += 1
                console.error(
                    `[migrate-to-enrollments] error on user ${user._id}:`,
                    err,
                )
            }
        }
    } finally {
        await mongoose.disconnect()
    }

    console.log("[migrate-to-enrollments] done.")
    console.log(`  scanned:              ${scanned}`)
    console.log(`  migrated:             ${migrated}`)
    console.log(`  skipped (already new):${skippedAlreadyOnNew}`)
    console.log(`  skipped (no legacy):  ${skippedNoLegacy}`)
    console.log(`  errors:               ${errors}`)

    if (errors > 0) {
        process.exit(1)
    }
}

run().catch((err) => {
    console.error("[migrate-to-enrollments] failed:", err)
    process.exit(1)
})
