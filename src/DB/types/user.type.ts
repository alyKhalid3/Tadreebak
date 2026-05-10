
export enum UserRoleEnum {
    ADMIN = 'admin',
    USER = 'user'
}
export type otp = {
    otp: string;
    expiresAt: Date;
}
export enum ProviderEnum {
    SYSTEM = 'system',
    GOOGLE = 'google',
    FACEBOOK = 'facebook'
}
export type fileAttributtes = {
    public_id: string;
    secure_url: string;
}
export interface IUser {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: UserRoleEnum;
    newEmail?: string;
    emailOtp: otp;
    passwordOtp: otp;
    newEmailOtp: otp;
    phoneNumber: string;
    isConfirmed: boolean;
    isChangeCredentialsUpdated: Date;
    profileImage: fileAttributtes;
    coverImage: fileAttributtes[];

    provider: ProviderEnum


}