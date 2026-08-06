import { getRedis, isRedisHealthy, markRedisHealthy, markRedisUnhealthy } from "./redis";

/**
 * Tiny read-through cache wrapper. The only API your service code needs
 * to learn:
 *
 *   const data = await cacheWrap("internships:list", 300, async () => {
 *     return internRepo.find(...)
 *   })
 *
 * Behavior:
 * - Redis hit  → return parsed JSON, no loader call
 * - Redis miss → run the loader, JSON.stringify the result, SET with TTL
 * - Redis down → fall through to the loader; opportunistically cache in
 *                a tiny in-process Map so dev still gets some value
 * - Loader throws → propagate, nothing cached
 *
 * Notes:
 * - All keys are namespaced under `tadreebak:v1:` so we can SCAN+DEL by
 *   prefix for bulk invalidation.
 * - TTL gets ±10% jitter to prevent cache stampedes when many keys expire
 *   at the same wall-clock time.
 * - Returned values are parsed as JSON. Callers should return
 *   JSON-serializable data (use `.lean()` on Mongoose queries, or
 *   `.toObject()` before returning).
 */

const KEY_PREFIX = "tadreebak:v1:";
const memFallback = new Map<string, { value: string; expiresAt: number }>();

// Cap the in-memory fallback so a long-running dev session doesn't OOM.
const MAX_MEM_ENTRIES = 500;
const memLru: string[] = []; // simple insertion order, good enough for fallback

const memSet = (key: string, value: string, ttlMs: number) => {
    memFallback.set(key, { value, expiresAt: Date.now() + ttlMs });
    memLru.push(key);
    if (memLru.length > MAX_MEM_ENTRIES) {
        const evict = memLru.shift();
        if (evict) memFallback.delete(evict);
    }
};

const memGet = (key: string): string | null => {
    const entry = memFallback.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        memFallback.delete(key);
        return null;
    }
    return entry.value;
};

const memDel = (key: string) => {
    memFallback.delete(key);
};

const memClearPrefix = (prefix: string) => {
    for (const key of memFallback.keys()) {
        if (key.startsWith(prefix)) memFallback.delete(key);
    }
};

const fullKey = (k: string) => `${KEY_PREFIX}${k}`;

type Loader<T> = () => Promise<T>;

/**
 * Read-through cache. Returns the loader's result on a miss, or the
 * cached value on a hit. Cache failures are never fatal.
 */
export const cacheWrap = async <T>(
    key: string,
    ttlSec: number,
    loader: Loader<T>,
): Promise<T> => {
    if (ttlSec <= 0) return loader();

    const k = fullKey(key);
    const r = getRedis();

    // 1. Try Redis first
    if (r && isRedisHealthy()) {
        try {
            const hit = await r.get(k);
            markRedisHealthy();
            if (hit !== null && hit !== undefined) {
                // The Upstash REST client auto-parses JSON on GET (when the
                // stored value looks like an object/array). So `hit` may
                // already be the parsed object, OR a raw string (if the
                // value wasn't valid JSON, which shouldn't happen for us
                // but we handle it anyway). Return as-is.
                return hit as T;
            }
        } catch {
            markRedisUnhealthy();
        }
    } else {
        // 2. Fall back to in-memory cache
        const hit = memGet(k);
        if (hit !== null) {
            return JSON.parse(hit) as T;
        }
    }

    // 3. Miss — run the loader
    const value = await loader();
    const serialized = JSON.stringify(value);

    // 4. Write through (with jitter to avoid stampedes)
    const jitter = Math.floor(ttlSec * (0.9 + Math.random() * 0.2));
    // Always populate the in-memory fallback so subsequent requests on
    // THIS process can still hit cache, even if Upstash is down.
    memSet(k, serialized, jitter * 1000);

    if (r && isRedisHealthy()) {
        try {
            await r.set(k, serialized, { ex: jitter });
            markRedisHealthy();
        } catch (err) {
            // First failure — log so the operator can see what's wrong.
            if (isRedisHealthy()) {
                // eslint-disable-next-line no-console
                console.warn("[cache] Upstash SET failed, falling back to in-memory:", (err as Error)?.message ?? err);
            }
            markRedisUnhealthy();
        }
    }
    return value;
};

/**
 * Delete a single key. Used when we know exactly which key to bust.
 */
export const cacheDel = async (key: string): Promise<void> => {
    const k = fullKey(key);
    const r = getRedis();
    if (r && isRedisHealthy()) {
        try {
            await r.del(k);
        } catch {
            // ignore
        }
    }
    memDel(k);
};

/**
 * Delete every key whose name starts with `prefix`. Used for bulk
 * invalidation (e.g. "an internship changed → drop every list cache").
 * Uses the Upstash cursor-based SCAN (no stream API in @upstash/redis),
 * never KEYS — KEYS blocks the server.
 */
export const cacheFlushPrefix = async (prefix: string): Promise<void> => {
    const p = fullKey(prefix);
    const r = getRedis();
    if (r && isRedisHealthy()) {
        try {
            // @upstash/redis scan returns [nextCursor, keys[]] per call.
            // cursor "0" means done.
            let cursor: string | number = 0;
            let safetyCounter = 0;
            const SAFETY_LIMIT = 10_000; // belt + suspenders
            do {
                const scanResult: [string | number, unknown] = await r.scan(cursor as any, {
                    match: `${p}*`,
                    count: 100,
                });
                const next: string | number = scanResult[0];
                const keys: unknown = scanResult[1];
                markRedisHealthy();
                const found: string[] = Array.isArray(keys) ? (keys as string[]) : [];
                if (found.length) {
                    // Chunk to avoid huge DELs on big key sets.
                    for (let i = 0; i < found.length; i += 100) {
                        await r.del(...(found.slice(i, i + 100) as [string, ...string[]]));
                    }
                }
                cursor = next;
                safetyCounter++;
            } while (cursor !== 0 && cursor !== "0" && safetyCounter < SAFETY_LIMIT);
        } catch {
            markRedisUnhealthy();
        }
    }
    memClearPrefix(p);
};

/**
 * For tests: clear the in-memory fallback between runs.
 * Not exported from the public API surface.
 */
export const __clearMemCache = (): void => {
    memFallback.clear();
    memLru.length = 0;
};
