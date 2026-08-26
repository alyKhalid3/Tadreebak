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
//   4. Stale (not sparse)       -> drops it, unsets any EXPLICIT null values
//      (sparse skips missing fields but would still index literal nulls),
//      then recreates it as unique + sparse.
//
// Usage:
//   npx tsx src/scripts/fix-user-phone-index.ts --uri "mongodb+srv://..."
//   (falls back to MONGO_URI from src/config/.env when --uri is omitted)
//
// Safe to re-run: every step is conditional/idempotent.
import mongoose from "mongoose";
import { Collection, Document } from "mongodb";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve("./src/config/.env") });

const argIndex = process.argv.indexOf("--uri");
const uri = argIndex !== -1 ? process.argv[argIndex + 1] : process.env.MONGO_URI;

if (!uri || !uri.trim()) {
    console.error("No MongoDB URI provided. Pass --uri \"mongodb+srv://...\" or set MONGO_URI.");
    process.exit(1);
}

type IndexInfo = { name: string; unique?: boolean; sparse?: boolean };

const ensureSparseUnique = async (
    collection: Collection<Document>,
    field: string,
): Promise<void> => {
    const indexName = `${field}_1`;
    const indexes = (await collection.indexes()) as IndexInfo[];
    const existing = indexes.find((i) => i.name === indexName);

    if (!existing) {
        console.log(`[${field}] index ${indexName} missing — creating unique+sparse`);
        await collection.createIndex({ [field]: 1 }, { unique: true, sparse: true });
        console.log(`[${field}] created`);
        return;
    }

    if (existing.unique && existing.sparse) {
        console.log(`[${field}] ${indexName} already unique+sparse — nothing to do`);
        return;
    }

    console.log(
        `[${field}] ${indexName} is STALE (unique=${!!existing.unique}, sparse=${!!existing.sparse}) — rebuilding`,
    );
    await collection.dropIndex(indexName);

    // Explicit `null` values are still indexed by a sparse index (only truly
    // missing fields are skipped). Unset them so the rebuilt index stays clean.
    const cleaned = await collection.updateMany(
        { [field]: { $type: "null" } },
        { $unset: { [field]: "" } },
    );
    if (cleaned.modifiedCount > 0) {
        console.log(`[${field}] unset explicit null on ${cleaned.modifiedCount} document(s)`);
    }

    await collection.createIndex({ [field]: 1 }, { unique: true, sparse: true });
    console.log(`[${field}] rebuilt as unique+sparse`);
};

const run = async (): Promise<void> => {
    console.log("Connecting…");
    const connection = await mongoose.connect(uri as string, {
        serverSelectionTimeoutMS: 10_000,
    });
    try {
        const users = connection.connection.db!.collection("users");
        await ensureSparseUnique(users, "phoneNumber");
        await ensureSparseUnique(users, "newEmail");
        console.log("Done.");
    } finally {
        await mongoose.disconnect();
    }
};

run().catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
});
