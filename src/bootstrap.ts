import type { Express, Request, NextFunction, Response } from 'express';
import express from 'express';
const app: Express = express();
import path from 'path';
import dotenv from 'dotenv';
import { connectDB } from './DB/db.connection';
import { IError } from './utils/error';
import baseRouter from './routes';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import helmet from 'helmet';
import cors from 'cors';
import { globalLimiter } from './middleware/rateLimiter';

dotenv.config({ path: path.resolve('./src/config/.env') });


export const bootstrap = () => {

    app.set('trust proxy', 1);

    app.use(cors({
        origin: [
            'https://tadrebk.vercel.app',
            'http://localhost:5173',
            'http://localhost:3000',
        ],
        credentials: true,
    }));
    app.options('*', cors());

    app.use(express.json());
    app.use(helmet());

    // app.use(globalLimiter)
    const port = process.env.PORT || 3000;

    connectDB();
    app.get('/test', (req, res) => res.json({ ok: true }));
    app.use('/api/v1', baseRouter)
    app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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