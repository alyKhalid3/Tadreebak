// One-off audit script. For every controller, count:
//   - route handlers (router.METHOD calls)
//   - @swagger blocks (one per route expected)
//   - routes with NO @swagger block
//   - routes with a "thin" @swagger block (no description, no requestBody, no responses)
//
// Run with:  node --import tsx scripts/audit-swagger.ts
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface Row {
    controller: string
    routes: number
    swaggerBlocks: number
    missing: number
    thin: number
    details: string[]
}

const ROOT = path.resolve(__dirname, "..", "src")
const files = [
    "modules/auth/auth.controller.ts",
    "modules/user/user.controller.ts",
    "modules/company/company.controller.ts",
    "modules/company/programs/programs.controller.ts",
    "modules/company/projects/projects.controller.ts",
    "modules/company/interns/interns.controller.ts",
    "modules/company/attendance/attendance.controller.ts",
    "modules/company/tasks/tasks.controller.ts",
    "modules/company/evaluations/evaluations.controller.ts",
    "modules/company/points/points.controller.ts",
    "modules/internModule/intern.controller.ts",
    "modules/internModule/invites.controller.ts",
    "modules/intern/me/internMe.controller.ts",
    "modules/intern/tasks/internTasks.controller.ts",
    "modules/intern/evaluations/internEvaluations.controller.ts",
    "modules/applicationModule/application.controller.ts",
    "modules/applicationModule/rating.controller.ts",
    "modules/savedCompanies/savedCompanies.controller.ts",
    "modules/contact/contact.controller.ts",
    "modules/newsletter/newsletter.controller.ts",
    "modules/reports/reports.controller.ts",
    "modules/certificates/certificates.controller.ts",
    "modules/company/instructors/instructors.controller.ts",
    "modules/company/roles/roles.controller.ts",
    "modules/permissions/permissions.controller.ts",
    "modules/me/me.controller.ts",
    "modules/notificationModule/notification.controller.ts",
    "modules/billingModule/billing.controller.ts",
]

const routeRegex = /\b(?:[a-zA-Z]\w*Router|\brouter)\.(get|post|patch|put|delete|all)\s*\(/g
const swaggerRegex = /@swagger\b/g

const rows: Row[] = []

for (const rel of files) {
    const fp = path.join(ROOT, rel)
    if (!fs.existsSync(fp)) {
        rows.push({ controller: rel, routes: 0, swaggerBlocks: 0, missing: 0, thin: 0, details: ["FILE NOT FOUND"] })
        continue
    }
    const src = fs.readFileSync(fp, "utf8")

    // Count route handlers
    const routeMatches = [...src.matchAll(routeRegex)]
    const routes = routeMatches.length

    // Find @swagger blocks and their content
    const blocks: { start: number; body: string; after: string }[] = []
    let m: RegExpExecArray | null
    const re = /@swagger\b([\s\S]*?)(?=\/\*\*\s*\n\s*\*\s*@swagger|@swagger|$)/g
    let lastIndex = 0
    while ((m = re.exec(src)) !== null) {
        const body = m[1]
        const start = m.index
        // Find the route handler that follows this block (within 4000 chars)
        const after = src.slice(start + 7, start + 7 + 4000)
        blocks.push({ start, body, after })
        if (blocks.length > 100) break
    }

    // More reliable: split file by "@swagger" markers and count
    const splitBySwagger = src.split("@swagger").length - 1
    const swaggerBlocks = splitBySwagger

    // For each route handler, check if there's a @swagger block within 600 chars before
    let missing = 0
    let thin = 0
    const details: string[] = []
    for (const m of routeMatches) {
        const idx = m.index ?? 0
        // Look backward up to 3000 chars for a @swagger marker
        const before = src.slice(Math.max(0, idx - 3000), idx)
        const lastSwagger = before.lastIndexOf("@swagger")
        if (lastSwagger === -1) {
            missing += 1
            continue
        }
        // Extract the body between lastSwagger and the route handler
        const blockBody = before.slice(lastSwagger)
        const hasDescription = /description:\s*[|\s]/.test(blockBody)
        const hasRequestBody = /requestBody:/.test(blockBody)
        const hasResponses = /responses:/.test(blockBody)
        if (!hasDescription && !hasRequestBody && !hasResponses) {
            thin += 1
        }
    }

    rows.push({
        controller: rel.replace("modules/", ""),
        routes,
        swaggerBlocks,
        missing,
        thin,
        details,
    })
}

console.log(
    "Controller".padEnd(45),
    "Routes".padStart(7),
    "Blocks".padStart(7),
    "Missing".padStart(8),
    "Thin".padStart(6),
)
console.log("-".repeat(80))
let totalRoutes = 0
let totalBlocks = 0
let totalMissing = 0
let totalThin = 0
for (const r of rows) {
    console.log(
        r.controller.padEnd(45),
        String(r.routes).padStart(7),
        String(r.swaggerBlocks).padStart(7),
        String(r.missing).padStart(8),
        String(r.thin).padStart(6),
    )
    totalRoutes += r.routes
    totalBlocks += r.swaggerBlocks
    totalMissing += r.missing
    totalThin += r.thin
}
console.log("-".repeat(80))
console.log(
    "TOTAL".padEnd(45),
    String(totalRoutes).padStart(7),
    String(totalBlocks).padStart(7),
    String(totalMissing).padStart(8),
    String(totalThin).padStart(6),
)
