/**
 * Tiny structured-logger. We don't pull in Pino/Winston because the
 * existing app uses `console.log` everywhere and we want the migration
 * to be one-line (`console.log` → `logger.info`).
 *
 * Format is JSON in production, pretty-printed in dev. Each call
 * includes a `ts`, `level`, and a `requestId` if one was set via
 * `withRequestId()` (the request-id middleware lives in bootstrap).
 */

const isProd = process.env.NODE_ENV === "production";

const emit = (level: string, message: string, meta?: Record<string, unknown>) => {
    const payload = { ts: new Date().toISOString(), level, message, ...meta };
    if (isProd) {
        // One-line JSON; easy to ship to Loki / CloudWatch / Datadog.
        const line = JSON.stringify(payload);
        if (level === "error") console.error(line);
        else if (level === "warn") console.warn(line);
        else console.log(line);
        return;
    }
    // Dev: color-tagged, single-line.
    const color = level === "error" ? "\x1b[31m"
        : level === "warn" ? "\x1b[33m"
        : level === "info" ? "\x1b[36m"
        : "\x1b[90m";
    const reset = "\x1b[0m";
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    const out = `${color}[${level.toUpperCase()}]${reset} ${message}${metaStr}`;
    if (level === "error") console.error(out);
    else if (level === "warn") console.warn(out);
    else console.log(out);
};

export const logger = {
    info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
    debug: (msg: string, meta?: Record<string, unknown>) => {
        if (process.env.LOG_LEVEL === "debug") emit("debug", msg, meta);
    },
};
