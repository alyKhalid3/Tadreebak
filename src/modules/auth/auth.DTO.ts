import z from "zod";
import { confirmEmailSchema, signupSchema } from "./auth.validation";



export type signupDTO=z.infer<typeof signupSchema>
export type confirmEmailDTO=z.infer<typeof confirmEmailSchema>