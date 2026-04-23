import nanoid from "nanoid";


 export const createOtp = ():string => {
    const otp =nanoid.customAlphabet('1234567890', 6)();
    return otp
};
