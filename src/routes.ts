
import { Router } from "express"
import { authRouter, authRoutes } from "./modules/auth";

const baseRouter = Router()
baseRouter.use(authRoutes.base, authRouter);

export default baseRouter