
import mongoose from "mongoose";


/**
 * Connect to MongoDB. L11: this used to swallow the error and let the HTTP
 * server come up anyway, so prod would happily start "running" while every
 * subsequent query hung. Now we throw on failure and let the caller
 * (bootstrap) decide whether to crash the process.
 */
export const connectDB = async (): Promise<void> => {
    await mongoose.connect(process.env.MONGO_URI as string, {
        // Fail fast on a bad URI / unreachable host instead of hanging the
        // boot forever.
        serverSelectionTimeoutMS: 10_000,
    });
    console.log('Connected to MongoDB');
}