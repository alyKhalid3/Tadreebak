// Phase 18B / Migration: seed Owner + Instructor roles for
// every company that doesn't already have them.
//
// Why this script:
//   Companies created BEFORE Phase 18B shipped won't have any
//   rows in the `CompanyRole` collection. New code (the staff
//   invite flow, the `assertStaffPermission` gate, the intern
//   supervisor endpoint) reads `CompanyRole` for every staff
//   check — without the seed, every staff user at a legacy
//   company gets 403'd the moment the new code rolls out.
//
//   `seedSystemRoles` is idempotent — it checks for an
//   existing 'Owner' / 'Instructor' row before creating, so
//   re-running is a no-op.
//
// Usage:
//   tsx src/scripts/seed-legacy-company-roles.ts [--dry-run]
//
//   --dry-run: log what would change without writing.
//
// What it does:
//   1. Find every Company with no CompanyRole of any kind
//      (the "no roles at all" case is the dangerous one — a
//      staff user can't do anything until the role is seeded).
//   2. For each, call `seedSystemRoles(companyId)`.
//   3. Log a per-company result.
//   4. Print a summary at the end (created / skipped / errors).
//
// Backwards compat:
//   - If a company already has an Owner role but no Instructor
//     (or vice versa), the inner `findOne` in `seedSystemRoles`
//     only creates the missing one.
//   - If a company has a custom role but no system roles, this
//     script seeds the system roles alongside the custom one.

import mongoose from "mongoose"
import dotenv from "dotenv"
import path from "path"
import { companyModel } from "../DB/models/company.model"
import { CompanyRoleModel } from "../DB/models/companyRole.model"
import { seedSystemRoles } from "../utils/seedSystemRoles"

dotenv.config({ path: path.resolve("./src/config/.env") })

const DRY_RUN = process.argv.includes("--dry-run")
const uri = process.env.MONGO_URI

if (!uri || !uri.trim()) {
    console.error("No MongoDB URI. Set MONGO_URI in src/config/.env")
    process.exit(1)
}

const main = async () => {
    console.log(`[seed-legacy-company-roles] ${DRY_RUN ? "DRY RUN" : "LIVE"} starting…`)
    const connection = await mongoose.connect(uri as string, {
        serverSelectionTimeoutMS: 10_000,
    })

    // Companies that have no Owner role. The "no roles at all"
    // case is the dangerous one (a staff user can't do anything
    // until seeded); a custom-only case is also handled.
    const companiesWithoutOwner = await companyModel.aggregate([
        {
            $lookup: {
                from: CompanyRoleModel.collection.name,
                localField: "_id",
                foreignField: "companyId",
                as: "roles",
            },
        },
        { $match: { "roles.isOwnerRole": { $ne: true } } },
        { $project: { _id: 1, name: 1 } },
    ])

    console.log(`[seed-legacy-company-roles] ${companiesWithoutOwner.length} companies need system roles`)

    let created = 0
    let skipped = 0
    let errors = 0

    for (const c of companiesWithoutOwner) {
        try {
            if (DRY_RUN) {
                console.log(`[seed-legacy-company-roles]   would seed ${c._id} (${c.name})`)
                skipped += 1
            } else {
                await seedSystemRoles(c._id)
                created += 1
                console.log(`[seed-legacy-company-roles]   seeded ${c._id} (${c.name})`)
            }
        } catch (err) {
            errors += 1
            console.error(`[seed-legacy-company-roles]   error on ${c._id} (${c.name}):`, err)
        }
    }

    console.log(`[seed-legacy-company-roles] done. created=${created} skipped=${skipped} errors=${errors}`)

    await connection.disconnect()
}

main().catch((err: unknown) => {
    console.error("[seed-legacy-company-roles] fatal:", err)
    process.exit(1)
})