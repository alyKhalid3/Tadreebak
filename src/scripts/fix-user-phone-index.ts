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
// Usage:
//   npx tsx src/scripts/fix-user-phone-index.ts                  (default: live mode)
//   npx tsx src/scripts/fix-user-phone-index.ts --dry-run        (preview only, no writes)
//   npx tsx src/scripts/fix-user-phone-index.ts --uri "mongodb+srv://..."
//   (falls back to MONGO_URI from src/config/.env when --uri is omitted)
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

if (!uri || !uri.trim()) {
    console.error("No MongoDB URI provided. Pass --uri \"mongodb+srv://...\" or set MONGO_URI.");
    process.exit(1);
}

type IndexInfo = { name: string; unique?: boolean; sparse?: boolean };

// Match every "bad" value for the field: explicit `null`, explicit
// empty string, AND a field whose value is missing but is set to
// `null` (e.g. a previous user who hit the bug and got `phone: null`
// persisted). All three should be `$unset` so the rebuilt sparse
// index stays clean.
const dirtyValues = (field: string) => ({
    $or: [
        { [field]: null },
        { [field]: "" },
    ],
});

const ensureSparseUnique = async (
    collection: Collection<Document>,
    field: string,
): Promise<void> => {
    const indexName = `${field}_1`;
    const indexes = (await collection.indexes()) as IndexInfo[];
    const existing = indexes.find((i) => i.name === indexName);

    if (!existing) {
        console.log(`[${field}] index ${indexName} missing — ${dryRun ? "would create" : "creating"} unique+sparse`);
        if (!dryRun) {
            await collection.createIndex({ [field]: 1 }, { unique: true, sparse: true });
            console.log(`[${field}] created`);
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

    // 1. Count the dirty rows first (always, even in --dry-run) so
    //    the operator sees the impact before committing.
    const dirtyCount = await collection.countDocuments(dirtyValues(field));

    if (dirtyCount > 0) {
        console.log(`[${field}] ${dirtyCount} document(s) have null/empty ${field}`);
        if (!dryRun) {
            const cleaned = await collection.updateMany(
                dirtyValues(field),
                { $unset: { [field]: "" } },
            );
            console.log(`[${field}] unset ${cleaned.modifiedCount} document(s)`);
        }
    } else {
        console.log(`[${field}] no null/empty ${field} values to clean`);
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
