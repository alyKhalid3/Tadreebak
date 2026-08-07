// Sentry must be initialised BEFORE any other module so it can patch
// core APIs (process, console, etc.) and capture errors from the moment
// the process starts. Sentry v10 docs:
//   https://docs.sentry.io/platforms/javascript/guides/express/install/
//
// We split this into its own file so the Sentry SDK is the very first
// import in src/index.ts. Without this split, an error in a module
// imported earlier (e.g. dotenv, the express init in bootstrap) would
// happen before Sentry is wired up and never get reported.
//
// Run with: `node --import ./src/instrument.ts src/index.ts`
// (the `--import` flag is required for Sentry v10 + ESM — it loads the
// SDK before any other module, so Express's prototype can be patched
// before the first request arrives).
//
// Environment variables (all optional except SENTRY_DSN in prod):
//   SENTRY_DSN                 Public DSN from your Sentry project. If empty,
//                              the SDK is a no-op (no events sent).
//   SENTRY_TRACES_SAMPLE_RATE  0.0–1.0. Defaults to 1.0 in dev, 0.1 in prod.
//                              Raise temporarily to debug a hot issue.
//   SENTRY_ENVIRONMENT         e.g. "production", "staging". Defaults to NODE_ENV.
//   SENTRY_RELEASE             Optional. Set to your git SHA or a release tag
//                              so errors are linked to a specific deploy.
//   SENTRY_DEBUG               "true" to enable verbose SDK logs (dev only).
//
// Sentry v10 changed the Express integration API. We no longer mount
// `Sentry.Handlers.requestHandler()` as a middleware — the
// `expressIntegration()` passed to Sentry.init() does the request
// instrumentation automatically. The error handler is mounted separately
// in bootstrap.ts via `Sentry.setupExpressErrorHandler(app)`.
import * as Sentry from "@sentry/node"
import { expressIntegration } from "@sentry/node"

const dsn = process.env.SENTRY_DSN?.trim() || ""
const nodeEnv = process.env.NODE_ENV || "development"
const isProd = nodeEnv === "production"

// Trace sampling: prod defaults to 10% to keep event volume manageable.
// The env var overrides the default for either env.
const defaultSampleRate = isProd ? 0.1 : 1.0
const sampleRate = Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? String(defaultSampleRate),
)

const environment = process.env.SENTRY_ENVIRONMENT || nodeEnv

// Enable verbose SDK logs only when explicitly asked, and never in prod.
const debug = process.env.SENTRY_DEBUG === "true" && !isProd

Sentry.init({
    dsn: dsn || undefined,
    tracesSampleRate: Number.isFinite(sampleRate) ? sampleRate : 0,
    environment,
    release: process.env.SENTRY_RELEASE || undefined,
    debug,
    // Drop personally-identifiable headers by default. The backend already
    // has CORS + auth, so Sentry doesn't need to capture IP / cookies.
    sendDefaultPii: false,
    integrations: (defaults) => {
        // v10 ships two integrations that call `process.exit(1)` after
        // capturing: `OnUncaughtException` and `OnUnhandledRejection`.
        // For a long-running Express server this is wrong — every
        // synchronous throw inside a route handler reaches Sentry's
        // uncaught hook (Express 5's error forwarding) and the process
        // gets killed. We already have:
        //   - `process.on('uncaughtException', ...)` in bootstrap.ts
        //   - `process.on('unhandledRejection', ...)` in bootstrap.ts
        //   - the global Express error handler in bootstrap.ts
        //   - `Sentry.setupExpressErrorHandler(app)` for the request scope
        // ...so let those own lifecycle. Sentry just observes and ships.
        return defaults.filter(
            (i) => i.name !== "OnUncaughtException" && i.name !== "OnUnhandledRejection",
        )
    },
    // Normalize 4xx to "warning" so dashboards don't fill up with expected
    // client errors (validation failures, 401s, 404s). 5xx stays "error".
    // Expected 4xx is also the biggest single source of noise in any
    // Sentry project — downgrading the level reduces alert fatigue.
    beforeSend(event) {
        const status = typeof event.extra?.statusCode === "number" ? event.extra.statusCode : 0
        if (status >= 400 && status < 500 && event.level === "error") {
            event.level = "warning"
        }
        return event
    },
})

export { Sentry }
