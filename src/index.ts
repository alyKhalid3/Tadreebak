// Sentry init MUST be the first import so it patches process / modules
// before any other code runs.
import "./instrument"

import { bootstrap } from "./bootstrap"

bootstrap().catch((err) => {
    console.error("Bootstrap failed:", err);
    process.exit(1);
});
