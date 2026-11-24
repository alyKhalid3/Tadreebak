// One-time repair for the Google-login E11000 crash
// (Sentry: "E11000 duplicate key error ... index: phoneNumber_1 dup key: { phoneNumber: null }").
//
// Root cause: `phoneNumber` is optional + unique. Google signups never set it,
// and MongoDB's unique index treats a MISSING field as `null` — so only ONE
// such user may exist. The schema declares `sparse: true`, but Mongoose never
// rebuilds an index that already exists, so environments indexed BEFORE that
// flag was added still run the old non-sparse `phoneNumber_1`.
//
// What this script does per field (`phoneNumber`, then `newEmail`):
//   1. Reads the live index definition.
//   2. Missing index            -> creates it as unique + sparse.
//   3. Already unique + sparse  -> leaves it alone.
//   4. Stale (not sparse)       -> drops it, unsets any EXPLICIT null OR
//      empty-string values (sparse skips missing fields but would still
//      index literal nulls AND empty strings), then recreates it as
//      unique + sparse.
//
// Phase 19 update — duplicate-detection pre-flight:
//   Before rebuilding the index, the script also scans for DUPLICATE
//   non-null/non-empty values in the data. If any exist, the
//   unique constraint can't be created — MongoDB would refuse with
//   E11000 (which is what blocks the rebuild mid-flight).
//
//   By default the script refuses to proceed when duplicates exist
//   and prints the offending values + how many rows each appears on,
//   so the operator can clean them up manually.
//
//   With the explicit `--auto-clean-duplicates` flag, the script
//   will:
//     - for each duplicated value, KEEP the row with the OLDEST
//       `createdAt` (the "first claimant" of that phone),
//     - `$unset` the field on every other row that has it,
//     - THEN create the index.
//
//   Auto-clean is intentionally opt-in. We don't want to silently
//   strip data from user accounts — the operator should see what's
//   going to happen first (use --dry-run to preview even with
//   --auto-clean-duplicates, the only difference is whether the
//   writes run).
//
// Usage:
//   npx tsx src/scripts/fix-user-phone-index.ts --dry-run
//   npx tsx src/scripts/fix-user-phone-index.ts --auto-clean-duplicates --dry-run
//   npx tsx src/scripts/fix-user-phone-index.ts
//   npx tsx src/scripts/fix-user-phone-index.ts --auto-clean-duplicates
//   npx tsx src/scripts/fix-user-phone-index.ts --uri "mongodb+srv://..."
//
// Safe to re-run: every step is conditional/idempotent.

import mongoose from "mongoose";
import { Collection, Document } from "mongodb";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve("./src/config/.env") });

const argv = process.argv.slice(2);
const argIndex = (flag: string) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
};
const uri = argIndex("--uri") ?? process.env.MONGO_URI;
const dryRun = argv.includes("--dry-run");
const autoCleanDuplicates = argv.includes("--auto-clean-duplicates");

if (!uri || !uri.trim()) {
    console.error("No MongoDB URI provided. Pass --uri \"mongodb+srv://...\" or set MONGO_URI.");
    process.exit(1);
}

type DuplicateRow = {
    value: string;
    count: number;
    keptId: string | null;
    keptEmail: string | null;
    keptCreatedAt: Date | string | null;
};

type IndexInfo = { name: string; unique?: boolean; sparse?: boolean };

// Match every "bad" value for the field: explicit `null` or
// empty string. Both are still indexed by a sparse index (only
// truly MISSING fields are skipped). Unset them so the rebuilt
// sparse index stays clean.
const dirtyNullishFilter = (field: string) => ({
    $or: [
        { [field]: null },
        { [field]: "" },
    ],
});

// Find every value that appears in more than one document.
// Returns an array of { value, count, keptId, keptEmail, keptCreatedAt }
// sorted by count desc. `kept*` describes the row that auto-clean
// would keep (the oldest by createdAt — the "first claimant" of
// that value).
const findDuplicates = async (
    collection: Collection<Document>,
    field: string,
): Promise<DuplicateRow[]> => {
    const pipeline = [
        // Only consider documents that have a non-null, non-empty
        // value of the field. Empty/null/empty-string values are
        // handled separately by the dirtyNullishFilter path.
        {
            $match: {
                [field]: { $type: "string", $ne: "" },
            },
        },
        {
            $group: {
                _id: `$${field}`,
                count: { $sum: 1 },
                // capture the oldest doc's id + createdAt so the
                // operator (or auto-clean) can see what we're keeping.
                firstId: { $first: "$_id" },
                firstCreatedAt: { $first: "$createdAt" },
                firstEmail: { $first: "$email" },
            },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
    ];
    const rows = await collection.aggregate(pipeline).toArray();
    return rows.map((r: any) => ({
        value: r._id as string,
        count: r.count as number,
        keptId: r.firstId?.toString() ?? null,
        keptEmail: (r.firstEmail as string | null) ?? null,
        keptCreatedAt: r.firstCreatedAt ?? null,
    }));
};

// For a single duplicated value, $unset the field on every doc
// EXCEPT the one with `keptId`. Returns how many docs were modified.
const dedupeValue = async (
    collection: Collection<Document>,
    field: string,
    value: string,
    keptId: string | null,
): Promise<number> => {
    const filter: Record<string, any> = { [field]: value };
    if (keptId) {
        filter._id = { $ne: new mongoose.Types.ObjectId(keptId) };
    }
    const r = await collection.updateMany(filter, { $unset: { [field]: "" } });
    return r.modifiedCount;
};

const ensureSparseUnique = async (
    collection: Collection<Document>,
    field: string,
): Promise<void> => {
    const indexName = `${field}_1`;
    const indexes = (await collection.indexes()) as IndexInfo[];
    const existing = indexes.find((i) => i.name === indexName);

    if (!existing) {
        console.log(`[${field}] index ${indexName} missing — ${dryRun ? "would create" : "creating"} unique+sparse`);

        // Pre-flight: duplicates. A unique index can't be built
        // when the data already has duplicates — MongoDB would
        // refuse with E11000. Detect them first.
        const dups = await findDuplicates(collection, field);
        if (dups.length > 0) {
            console.log(`[${field}] ⚠️  ${dups.length} duplicate value(s) in the data:`);
            for (const d of dups) {
                console.log(
                    `     "${d.value}"  × ${d.count}  (keeping oldest: ${d.keptEmail ?? d.keptId ?? "n/a"})`,
                );
            }
            if (!autoCleanDuplicates) {
                console.log(
                    `[${field}] ❌ refusing to create the index — duplicates must be resolved first.`,
                );
                console.log(
                    `     Re-run with --auto-clean-duplicates to $unset the field on all but the oldest row per value.`,
                );
                console.log(
                    `     Or clean manually: pick a winner per value, then re-run.`,
                );
                return;
            }
            console.log(`[${field}] --auto-clean-duplicates set: deduping now…`);
            if (dryRun) {
                console.log(`[${field}] (dry-run: would $unset, not actually writing)`);
            } else {
                let totalModified = 0;
                for (const d of dups) {
                    const modified = await dedupeValue(collection, field, d.value, d.keptId);
                    if (modified > 0) {
                        console.log(`[${field}]   "${d.value}": unset on ${modified} doc(s), kept ${d.keptEmail ?? d.keptId}`);
                        totalModified += modified;
                    }
                }
                console.log(`[${field}] dedupe total: ${totalModified} doc(s) modified`);
            }
        } else {
            console.log(`[${field}] no duplicate values — safe to build unique index`);
        }

        if (!dryRun) {
            await collection.createIndex({ [field]: 1 }, { unique: true, sparse: true });
            console.log(`[${field}] created as unique+sparse`);
        }
        return;
    }

    if (existing.unique && existing.sparse) {
        console.log(`[${field}] ${indexName} already unique+sparse — nothing to do`);
        return;
    }

    console.log(
        `[${field}] ${indexName} is STALE (unique=${!!existing.unique}, sparse=${!!existing.sparse}) — ${dryRun ? "would rebuild" : "rebuilding"}`,
    );

    // Phase 19 / also clean any null/empty values that would still
    // be indexed by the rebuilt sparse index.
    const dirtyCount = await collection.countDocuments(dirtyNullishFilter(field));
    if (dirtyCount > 0) {
        console.log(`[${field}] ${dirtyCount} document(s) have null/empty ${field}`);
        if (!dryRun) {
            const cleaned = await collection.updateMany(
                dirtyNullishFilter(field),
                { $unset: { [field]: "" } },
            );
            console.log(`[${field}] unset ${cleaned.modifiedCount} document(s)`);
        }
    } else {
        console.log(`[${field}] no null/empty ${field} values to clean`);
    }

    // Pre-flight: also catch duplicates before rebuilding the
    // (would-be-stale-then-new) index. Otherwise the rebuild would
    // fail with E11000 mid-flight.
    const dups = await findDuplicates(collection, field);
    if (dups.length > 0) {
        console.log(`[${field}] ⚠️  ${dups.length} duplicate value(s) in the data:`);
        for (const d of dups) {
            console.log(
                `     "${d.value}"  × ${d.count}  (keeping oldest: ${d.keptEmail ?? d.keptId ?? "n/a"})`,
            );
        }
        if (!autoCleanDuplicates) {
            console.log(
                `[${field}] ❌ refusing to rebuild the index — duplicates must be resolved first.`,
            );
            console.log(
                `     Re-run with --auto-clean-duplicates to $unset the field on all but the oldest row per value.`,
            );
            return;
        }
        console.log(`[${field}] --auto-clean-duplicates set: deduping now…`);
        if (dryRun) {
            console.log(`[${field}] (dry-run: would $unset, not actually writing)`);
        } else {
            let totalModified = 0;
            for (const d of dups) {
                const modified = await dedupeValue(collection, field, d.value, d.keptId);
                if (modified > 0) {
                    console.log(`[${field}]   "${d.value}": unset on ${modified} doc(s), kept ${d.keptEmail ?? d.keptId}`);
                    totalModified += modified;
                }
            }
            console.log(`[${field}] dedupe total: ${totalModified} doc(s) modified`);
        }
    } else {
        console.log(`[${field}] no duplicate values — safe to build unique index`);
    }

    if (!dryRun) {
        await collection.dropIndex(indexName);
        await collection.createIndex({ [field]: 1 }, { unique: true, sparse: true });
        console.log(`[${field}] rebuilt as unique+sparse`);
    }
};

const run = async (): Promise<void> => {
    if (dryRun) {
        console.log("=== DRY RUN — no writes will be made ===");
    }
    if (autoCleanDuplicates) {
        console.log("=== --auto-clean-duplicates set: deduping non-null values too ===");
    }
    console.log("Connecting…");
    const connection = await mongoose.connect(uri as string, {
        serverSelectionTimeoutMS: 10_000,
    });
    try {
        const users = connection.connection.db!.collection("users");
        await ensureSparseUnique(users, "phoneNumber");
        await ensureSparseUnique(users, "newEmail");
        if (dryRun) {
            console.log("=== DRY RUN complete — re-run without --dry-run to apply ===");
        } else {
            console.log("Done.");
        }
    } finally {
        await mongoose.disconnect();
    }
};

run().catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
});
