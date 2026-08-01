import type { Express, Request, NextFunction, Response } from 'express';
import express from 'express';
const app: Express = express();
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { connectDB } from './DB/db.connection';
import { IError } from './utils/error';
import baseRouter from './routes';
import { swaggerSpec } from './config/swagger';
import helmet from 'helmet';
import cors from 'cors';
import { globalLimiter } from './middleware/rateLimiter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const swaggerUiDistPath = path.resolve(__dirname, '..', 'node_modules', 'swagger-ui-dist');

const swaggerUiHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tadreebak API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="/api/v1/docs/swagger-ui.css" />
  <link rel="icon" type="image/png" href="/api/v1/docs/favicon-32x32.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="/api/v1/docs/favicon-16x16.png" sizes="16x16" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/v1/docs/swagger-ui-bundle.js"></script>
  <script src="/api/v1/docs/swagger-ui-standalone-preset.js"></script>
  <script src="/api/v1/docs/swagger-init.js"></script>
</body>
</html>`;

const swaggerInitJs = `
window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '/api/v1/docs/swagger.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    plugins: [SwaggerUIBundle.plugins.DownloadUrl],
    layout: 'StandaloneLayout'
  });
};
`;

dotenv.config({ path: path.resolve('./src/config/.env') });

// M2: register process-level handlers ONCE at module load, not inside
// bootstrap(), so they cover any code path (including the side-effect
// import of notificationBus and the email emitter) regardless of whether
// bootstrap() is called more than once in tests.
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    // Let the orchestrator restart us; we don't try to keep going.
    process.exit(1);
});


export const bootstrap = async () => {

    app.set('trust proxy', 1);

    // Whitelist of origins allowed to call the API with credentials. Used both
    // by the explicit preflight handler below AND by the `cors()` middleware —
    // keeping a single source of truth so a typo can't drift the two apart.
    const allowedOrigins = new Set<string>([
        'https://tadrebk.vercel.app',
        'http://localhost:5173',
        'http://localhost:3000',
    ]);

    // Handle preflight OPTIONS before anything else — including Helmet —
    // so the browser never sees a CORS error on non-simple requests. We must
    // echo back ONLY whitelisted origins; reflecting any origin with
    // `Access-Control-Allow-Credentials: true` is a credentialed-CORS bypass.
    app.use((req: Request, res: Response, next: NextFunction) => {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.has(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        }
        if (req.method === 'OPTIONS') {
            return res.status(204).end();
        }
        next();
    });

    app.use(cors({
        origin: (origin, callback) => {
            // Same-origin / curl / server-to-server (no Origin header) — allow.
            if (!origin) return callback(null, true);
            if (allowedOrigins.has(origin)) return callback(null, true);
            return callback(new Error(`Origin ${origin} not allowed by CORS`));
        },
        credentials: true,
    }));

    app.use(express.json());
    app.use(helmet());

    // Skip the global limiter on the docs + health endpoints so the swagger
    // UI assets are always reachable, then apply it to everything else.
    app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/api/v1/docs') || req.path === '/test' || req.path === '/health') {
            return next();
        }
        return globalLimiter(req, res, next);
    });

    const port = process.env.PORT || 3000;

    // L11: actually await the DB connection. The previous version fired
    // connectDB() and immediately called app.listen(), so a missing URI or
    // a bad host would let the server start "running" while every query
    // hung. We now surface the failure to the caller of bootstrap().
    try {
        await connectDB();
    } catch (err) {
        console.error('Failed to connect to MongoDB — refusing to start server:', err);
        process.exit(1);
    }

    /**
     * @swagger
     * /health:
     *   get:
     *     summary: Liveness probe
     *     description: |
     *       Public health check. Use this for uptime monitoring and load-balancer
     *       probes. Returns the process uptime in seconds.
     *     tags: [System]
     *     responses:
     *       200:
     *         description: Service is up
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok: { type: boolean, example: true }
     *                 uptime: { type: number, description: "Process uptime in seconds" }
     */
    app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
    app.use('/api/v1', baseRouter)

    // M8: in production the swagger UI leaks the entire route surface
    // (including the dangerous confirmPayment endpoint) to anyone with the
    // URL. Gate it behind NODE_ENV unless the operator explicitly opts in
    // via the ALLOW_SWAGGER_IN_PROD env var (useful for staging).
    const showSwagger = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SWAGGER_IN_PROD === 'true';

    if (showSwagger) {
        // Serve the OpenAPI spec as a separate JSON endpoint with no-cache headers.
        // The Swagger UI fetches this on every page load, so it never shows a stale spec.
        app.get('/api/v1/docs/swagger.json', (req: Request, res: Response) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.json(swaggerSpec);
        });

        // Serve Swagger UI static assets (CSS/JS bundles) directly from swagger-ui-dist.
        // Do NOT let it serve its own index.html — we serve a custom shell instead.
        app.use('/api/v1/docs', express.static(swaggerUiDistPath, { index: false }));

        // Swagger UI init script (external file — inline scripts are blocked by helmet's CSP).
        app.get('/api/v1/docs/swagger-init.js', (req: Request, res: Response) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.type('application/javascript').send(swaggerInitJs);
        });

        // Custom Swagger UI HTML shell — contains NO spec at all.
        // The UI fetches /api/v1/docs/swagger.json at runtime, so the spec can never
        // be baked into a cached page.
        app.get(['/api/v1/docs', '/api/v1/docs/'], (req: Request, res: Response) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.type('html').send(swaggerUiHtml);
        });
    }

    app.use((req: Request, res: Response) => {
        return res.status(404).json({ errMsg: 'Route not found', cause: 404 })
    });

    app.use((err: IError, req: Request, res: Response, next: NextFunction): Response | void => {
        const statusCode = err.statusCode || 500;
        const body: Record<string, unknown> = {
            errMsg: err.message,
            cause: statusCode,
        }
        if (process.env.NODE_ENV !== 'production') {
            body.stack = err.stack;
        }
        return res.status(statusCode).json(body)
    });

    // M2: graceful shutdown. The orchestrator (Docker / k8s) sends SIGTERM
    // and gives us a grace period before SIGKILL. We close the HTTP server
    // (so we stop accepting new requests) and let in-flight ones finish,
    // then disconnect Mongoose.
    const server = app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
    const shutdown = async (signal: string) => {
        console.log(`Received ${signal}, shutting down gracefully...`);
        server.close((err) => {
            if (err) console.error('Error during server.close:', err);
        });
        try {
            const mongoose = await import('mongoose');
            await mongoose.default.disconnect();
        } catch (err) {
            console.error('Error disconnecting MongoDB:', err);
        }
        process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}