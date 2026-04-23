import {nanoid,customAlphabet} from "nanoid";


 export const createOtp = ():string => {
    const otp =customAlphabet('1234567890', 6)();
    return otp
};
