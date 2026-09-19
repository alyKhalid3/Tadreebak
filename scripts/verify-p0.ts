// P0 deployment verifier.
//
// Two P0 items from BACKEND_GAPS_EN.md block the frontend today:
//   F. Evaluations endpoints must be deployed
//   G. Single-mark attendance (POST .../interns/:internId/attendance) must
//      either exist or be officially deprecated in favor of bulk-mark
//
// The script confirms both:
//
//   1. CODE-SIDE: every P0 route is registered in the swagger spec
//      generated from the JSDoc. If any is missing, the script fails
//      with a clear message so we know what to fix before deploy.
//
//   2. NETWORK-SIDE (optional): if BACKEND_URL is set (e.g.
//      `https://api.tadreebak-e285.onbelmo.uk/api/v1`), the script
//      fetches /api-docs and re-verifies the same paths exist in
//      the running server. With no BACKEND_URL, skip the network step
//      (only the code-side check runs).
//
// Usage:
//   node --import tsx scripts/verify-p0.ts                  # code check only
//   BACKEND_URL=https://api.example.com/api/v1 \
//     node --import tsx scripts/verify-p0.ts                # code + live
import { swaggerSpec } from "../src/config/swagger"

interface Check {
    method: string
    path: string
    found: boolean
    summary?: string
}

const P0_PATHS: Array<{ method: string; path: string; why: string }> = [
    // F. Evaluations
    { method: "get", path: "/company/{companyId}/evaluations", why: "F — evaluations list" },
    { method: "get", path: "/company/{companyId}/evaluations/dashboard", why: "F — evaluations KPIs" },
    { method: "get", path: "/company/{companyId}/evaluations/alerts", why: "F — evaluations alerts" },
    { method: "post", path: "/company/{companyId}/interns/{internId}/evaluations", why: "F — evaluations create" },
    { method: "get", path: "/company/{companyId}/evaluations/{evaluationId}", why: "F — evaluations detail" },
    { method: "patch", path: "/company/{companyId}/evaluations/{evaluationId}", why: "F — evaluations update (before share)" },
    { method: "patch", path: "/company/{companyId}/evaluations/{evaluationId}/share", why: "F — evaluations share" },
    // G. Attendance single-mark (also kept by bulk-mark)
    { method: "post", path: "/company/{companyId}/interns/{internId}/attendance", why: "G — single attendance mark" },
    { method: "post", path: "/company/{companyId}/attendance/bulk-mark", why: "G — bulk-mark fallback the frontend already uses" },
]

const looksLikePath = (pathItem: string, target: string): boolean => {
    // Swagger URLs may be `/company/{companyId}/evaluations` (literal)
    // or stored as is. Match the literal parameter shape.
    return pathItem === target
}

const checkSpec = (spec: any): Check[] => {
    const paths = spec.paths ?? {}
    return P0_PATHS.map(({ method, path, why }) => {
        const item = paths[path]
        const op = item?.[method]
        return {
            method: method.toUpperCase(),
            path,
            found: !!op,
            summary: op?.summary,
        }
    })
}

const checkLiveServer = async (
    baseUrl: string,
): Promise<{ ok: boolean; checks: Check[]; error?: string }> => {
    try {
        const url = `${baseUrl.replace(/\/$/, "")}/docs-json`
        const res = await fetch(url, {
            headers: { Accept: "application/json" },
        })
        if (!res.ok) {
            return { ok: false, checks: [], error: `HTTP ${res.status} from ${url}` }
        }
        const spec = (await res.json()) as any
        return { ok: true, checks: checkSpec(spec) }
    } catch (e: any) {
        return { ok: false, checks: [], error: e?.message ?? String(e) }
    }
}

const printResult = (
    label: string,
    checks: Check[],
    failed: boolean,
) => {
    console.log(`\n=== ${label} ===`)
    let ok = 0
    let missing = 0
    for (const c of checks) {
        if (c.found) {
            ok += 1
            console.log(`  \u2713  ${c.method.padEnd(6)} ${c.path}`)
        } else {
            missing += 1
            console.log(`  \u2717  ${c.method.padEnd(6)} ${c.path}   \u2014 MISSING`)
        }
    }
    console.log(`  ${ok} ok, ${missing} missing`)
    if (failed) {
        process.exitCode = 1
    }
}

const main = async () => {
    console.log("P0 deployment verifier")
    console.log(`Source: src/config/swagger.ts (jsdoc scan)`)

    // 1. Code-side check.
    const codeChecks = checkSpec(swaggerSpec)
    printResult("CODE-SIDE spec (from generated swaggerSpec)", codeChecks, false)
    const codeMissing = codeChecks.filter((c) => !c.found)
    if (codeMissing.length > 0) {
        console.log("\n\u26a0  Some P0 paths are missing from the generated spec.")
        console.log("   This means the JSDoc/component route block was not registered.")
        console.log("   Re-check the controller files for these paths:")
        for (const c of codeMissing) console.log(`     - ${c.method} ${c.path}`)
        process.exitCode = 1
        return
    }

    // 2. Network-side check (optional).
    const baseUrl = process.env.BACKEND_URL
    if (!baseUrl) {
        console.log("\n--- Network check skipped (no BACKEND_URL env) ---")
        console.log("Set BACKEND_URL=https://your.api/api/v1 to verify the live server.")
        return
    }

    console.log(`\nLive URL: ${baseUrl}`)
    const result = await checkLiveServer(baseUrl)
    if (!result.ok) {
        console.log(`\u2717  Could not fetch ${baseUrl}/docs-json: ${result.error}`)
        process.exitCode = 2
        return
    }
    // Don't exit non-zero — the live server might be missing some paths.
    // Print a separate pass/fail so the operator sees both the code version
    // (truth) and the live version (deploy status).
    printResult(`LIVE server: ${baseUrl}`, result.checks, true)
}

main().catch((err) => {
    console.error("verify-p0 crashed:", err)
    process.exit(3)
})
