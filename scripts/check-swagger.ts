// One-off swagger verification script. Lists all eval-related
// paths and schemas in the generated spec so we can confirm the
// new JSDoc blocks parsed correctly.
import { swaggerSpec } from "../src/config/swagger"

const paths = swaggerSpec.paths as Record<string, any>
const schemas = (swaggerSpec.components as any).schemas as Record<string, any>

console.log("Total paths:", Object.keys(paths).length)
console.log("Total schemas:", Object.keys(schemas).length)
console.log()
console.log("=== Eval paths ===")
for (const [p, methods] of Object.entries(paths)) {
    if (!p.toLowerCase().includes("evaluation")) continue
    for (const [m, op] of Object.entries(methods)) {
        const o = op as any
        console.log(`${m.toUpperCase().padEnd(6)} ${p}`)
        console.log("       summary:", o.summary ?? "(none)")
        console.log("       tags:   ", (o.tags ?? []).join(", "))
        console.log("       params: ", (o.parameters ?? []).length, " defined")
        console.log("       body:   ", o.requestBody ? "yes" : "no")
        console.log("       resps:  ", Object.keys(o.responses ?? {}).sort().join(","))
    }
}
console.log()
console.log("=== Eval schemas ===")
for (const k of Object.keys(schemas).sort()) {
    if (!k.toLowerCase().includes("eval") && !k.toLowerCase().includes("pagination") && !k.toLowerCase().includes("internsummary")) continue
    console.log("  ", k)
}
