
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
export interface IEducation {
    institution: string;
    degree: string;
    field: string;
    startDate: Date;
    endDate?: Date;
}
export interface IExperience {
    company: string;
    title: string;
    description?: string;
    startDate: Date;
    endDate?: Date;
}
export interface IUser {
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
    role: UserRoleEnum;
    newEmail?: string;
    emailOtp: otp;
    passwordOtp: otp;
    newEmailOtp: otp;
    phoneNumber: string;
    isConfirmed: boolean;
    isChangeCredentialsUpdated?: Date;
    profilePicture: fileAttributtes;
    coverPicture: fileAttributtes;
    provider: ProviderEnum;

    bio?: string;
    headline?: string;
    skills?: string[];
    education?: IEducation[];
    experience?: IExperience[];
    resume?: fileAttributtes;
    dateOfBirth?: Date;
    gender?: 'male' | 'female';
    address?: string;
}