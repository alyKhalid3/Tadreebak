
import mongoose from "mongoose";


export const connectDB = async (): Promise<void> => {
    await mongoose.connect(process.env.MONGO_URI as string).then(() => {
        console.log('Connected to MongoDB');
    }).catch((err) => {
        console.error('Error connecting to MongoDB:', err);
    });
}