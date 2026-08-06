import { test } from "node:test";
import assert from "node:assert/strict";

// Make sure no REDIS_URL is set, so getRedis() returns null and we test
// the in-memory fallback path.
delete process.env.REDIS_URL;
delete process.env.CACHE_ENABLED;

const { cacheWrap, cacheDel, cacheFlushPrefix, __clearMemCache } = await import("./cache");

test("cacheWrap: loader runs on miss, result is returned", async () => {
    __clearMemCache();
    let calls = 0;
    const loader = async () => {
        calls++;
        return { value: "first" };
    };
    const result = await cacheWrap("k1", 60, loader);
    assert.deepEqual(result, { value: "first" });
    assert.equal(calls, 1);
});

test("cacheWrap: second call within TTL does not invoke the loader", async () => {
    __clearMemCache();
    let calls = 0;
    const loader = async () => {
        calls++;
        return { value: "second" };
    };
    await cacheWrap("k2", 60, loader);
    const result = await cacheWrap("k2", 60, loader);
    assert.deepEqual(result, { value: "second" });
    assert.equal(calls, 1, "loader should have run exactly once");
});

test("cacheWrap: ttl=0 always runs the loader (cache disabled)", async () => {
    __clearMemCache();
    let calls = 0;
    const loader = async () => {
        calls++;
        return { v: calls };
    };
    await cacheWrap("k3", 0, loader);
    await cacheWrap("k3", 0, loader);
    assert.equal(calls, 2);
});

test("cacheWrap: ttl=-1 always runs the loader (cache disabled)", async () => {
    __clearMemCache();
    let calls = 0;
    const loader = async () => {
        calls++;
        return { v: calls };
    };
    await cacheWrap("k4", -1, loader);
    await cacheWrap("k4", -1, loader);
    assert.equal(calls, 2);
});

test("cacheWrap: loader throw is propagated, nothing cached", async () => {
    __clearMemCache();
    const fail = async () => {
        throw new Error("boom");
    };
    await assert.rejects(() => cacheWrap("k5", 60, fail), /boom/);
    // After the throw, a second call should retry (not serve a cached
    // value), proving we didn't store the failed result.
    let calls = 0;
    const ok = async () => {
        calls++;
        return { ok: true };
    };
    const r = await cacheWrap("k5", 60, ok);
    assert.deepEqual(r, { ok: true });
    assert.equal(calls, 1);
});

test("cacheDel: removes a key from the in-memory store", async () => {
    __clearMemCache();
    let calls = 0;
    const loader = async () => {
        calls++;
        return { v: calls };
    };
    await cacheWrap("k6", 60, loader);
    await cacheDel("k6");
    const r = await cacheWrap("k6", 60, loader);
    assert.equal(r.v, 2, "loader should have run a second time after cacheDel");
});

test("cacheFlushPrefix: removes all keys with matching prefix", async () => {
    __clearMemCache();
    await cacheWrap("users:1", 60, async () => "alice");
    await cacheWrap("users:2", 60, async () => "bob");
    await cacheWrap("orders:1", 60, async () => "ord");
    await cacheFlushPrefix("users:");
    // After flush, users:* must re-invoke their loaders.
    let userCalls = 0;
    await cacheWrap("users:1", 60, async () => { userCalls++; return "alice-2"; });
    let orderCalls = 0;
    await cacheWrap("orders:1", 60, async () => { orderCalls++; return "ord" });
    assert.equal(userCalls, 1, "users:1 should have re-loaded after prefix flush");
    assert.equal(orderCalls, 0, "orders:1 should still be cached");
});

test("cacheWrap: namespaces keys so different cache groups don't collide", async () => {
    __clearMemCache();
    await cacheWrap("a:b", 60, async () => "group-a");
    await cacheWrap("c:d", 60, async () => "group-c");
    // Both should be independently cached.
    let aCalls = 0;
    let cCalls = 0;
    await cacheWrap("a:b", 60, async () => { aCalls++; return "X"; });
    await cacheWrap("c:d", 60, async () => { cCalls++; return "Y"; });
    assert.equal(aCalls, 0);
    assert.equal(cCalls, 0);
});
