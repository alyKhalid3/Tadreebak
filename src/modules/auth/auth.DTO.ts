import z from "zod";
import { confirmEmailSchema, signupSchema, changePasswordSchema, changeEmailSchema } from "./auth.validation";



export type signupDTO=z.infer<typeof signupSchema>
export type confirmEmailDTO=z.infer<typeof confirmEmailSchema>
export type changePasswordDTO = z.infer<typeof changePasswordSchema>
export type changeEmailDTO = z.infer<typeof changeEmailSchema>