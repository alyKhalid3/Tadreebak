import { Redis } from "@upstash/redis";

/**
 * Upstash Redis client (REST API). Why Upstash REST and not ioredis:
 * - The credentials you have are REST API keys (Upstash's serverless-friendly
 *   HTTP endpoint), not a standard Redis protocol URL. ioredis would refuse
 *   to connect.
 * - The REST client is connectionless, so no TCP pool to manage, no
 *   "connection refused" on cold starts in serverless deploys.
 * - Same GET/SET/DEL/SCAN surface as the standard client, just slower
 *   per op (HTTP round-trip vs in-memory pipeline). For a cache layer
 *   that's a fine trade.
 *
 * Behavior on outage:
 * - If the env vars are missing, we operate in pure in-memory fallback
 *   mode (see cache.ts). The app keeps working.
 * - If the REST endpoint is unreachable, every cache call fails fast
 *   and falls through to the in-memory fallback. No 500s, no retries
 *   piling up.
 */
let client: Redis | null = null;
let healthy = false;
let explicitlyDisabled = false;

export const getRedis = (): Redis | null => {
    if (explicitlyDisabled) return null;
    if (client) return client;

    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) {
        // No URL/token configured — operate in memory-only mode.
        return null;
    }
    if (process.env.CACHE_ENABLED === "false") {
        explicitlyDisabled = true;
        return null;
    }

    client = new Redis({
        url,
        token,
        // The Upstash client has automatic retry with exponential backoff
        // built in. We surface only the first failure to avoid log spam.
        retry: { retries: 2, backoff: (n) => Math.min(n * 200, 2000) },
    });
    healthy = true;
    return client;
};

export const isRedisHealthy = (): boolean => {
    if (!client) return false;
    // @upstash/redis doesn't expose a synchronous "ready" flag like ioredis
    // does — its commands return promises that reject on failure. So we
    // optimistically return true; cache.ts wraps every call in try/catch
    // and flips the flag if it throws.
    return healthy;
};

/**
 * Flag the cache as unhealthy. Called by cache.ts when a command rejects.
 * Used by the rate limiter to skip the Redis store during an outage.
 */
export const markRedisUnhealthy = (): void => {
    healthy = false;
};

export const markRedisHealthy = (): void => {
    healthy = true;
};

/**
 * No-op close. The REST client has no persistent socket, so there's
 * nothing to close. Kept as a no-op so the shutdown handler in
 * bootstrap.ts can call it uniformly.
 */
export const closeRedis = async (): Promise<void> => {
    client = null;
    healthy = false;
};
