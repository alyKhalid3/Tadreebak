import type { Express, Request, NextFunction, Response } from 'express';
import express from 'express';
const app: Express = express();
import path from 'path';
import dotenv from 'dotenv';
import { connect } from 'http2';
import { connectDB } from './DB/db.connection';
import { IError } from './utils/error';
import baseRouter from './routes';
if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: path.resolve('./src/config/.env') });
}


export const bootstrap = () => {


    app.use(express.json());

    const port = process.env.PORT || 5000;
    connectDB();
    app.use('/api/v1', baseRouter)
    app.use((err: IError, req: Request, res: Response, next: NextFunction): Response | void => {
        return res.status(err.statusCode || 500).json({
            errMsg: err.message,
            cause: err.statusCode || 500,
            stack: err.stack
        })
    });

    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}