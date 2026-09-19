// Export the generated swagger spec to `live_swagger.json` at the
// project root. The hosting provider serves this file in place of the
// real swagger UI — run this script after every backend change and
// upload the new file to the host.
//
// Usage:
//   node --import tsx scripts/export-live-swagger.ts
import { swaggerSpec } from "../src/config/swagger"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const out = path.resolve(__dirname, "..", "live_swagger.json")

const json = JSON.stringify(swaggerSpec, null, 2)
fs.writeFileSync(out, json + "\n", "utf8")
console.log(`Wrote ${out} (${(json.length / 1024).toFixed(1)} KB, ${Object.keys(swaggerSpec.paths).length} paths, ${Object.keys((swaggerSpec.components as any).schemas).length} schemas)`)
