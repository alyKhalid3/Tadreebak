import type { IUser } from "../DB/types/user.type";

/**
 * Strip every field the client should never see (password hash, all OTPs,
 * credential-change timestamp, version key) and return a plain object safe
 * to ship back in an HTTP response.
 *
 * Use this anywhere a Mongoose user document leaves the server.
 */
export const toSafeUser = (user: IUser | Record<string, any>) => {
    const obj = typeof (user as any).toObject === "function" ? (user as any).toObject() : user;
    const {
        password,
        emailOtp,
        passwordOtp,
        newEmailOtp,
        isChangeCredentialsUpdated,
        newEmail,
        __v,
        ...safe
    } = obj as Record<string, any>;
    return safe;
};
