
export enum UserRoleEnum {
    ADMIN = 'admin',
    USER = 'user'
}
export type otp={
    otp: string;
    expiresAt: Date;
}
export enum ProviderEnum{
    SYSTEM='system',
    GOOGLE='google',
    FACEBOOK='facebook'
}
export interface IUser {
    firstName: string;
    lastName:string;
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
    profileImage: string;
    coverImage: string[];
    
    provider:ProviderEnum


}