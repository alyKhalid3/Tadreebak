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


export const bootstrap = () => {

    app.set('trust proxy', 1);

    // Handle preflight OPTIONS before anything else — including Helmet —
    // so the browser never sees a CORS error on non-simple requests.
    app.use((req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        if (req.method === 'OPTIONS') {
            return res.status(204).end();
        }
        next();
    });

    app.use(cors({
        origin: [
            'https://tadrebk.vercel.app',
            'http://localhost:5173',
            'http://localhost:3000',
        ],
        credentials: true,
    }));

    app.use(express.json());
    app.use(helmet());

    // app.use(globalLimiter)
    const port = process.env.PORT || 3000;

    connectDB();
    app.get('/test', (req, res) => res.json({ ok: true }));
    app.use('/api/v1', baseRouter)

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

    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}