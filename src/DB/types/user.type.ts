
export enum UserRoleEnum {
    ADMIN = 'admin',
    USER = 'user',
    STUDENT = 'student',
    COMPANY_OWNER = 'company_owner',
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

export const INTEREST_CATEGORIES = [
    'frontend',
    'backend',
    'fullstack',
    'mobile',
    'uiux',
    'devops',
    'data_science',
    'ai_ml',
    'cybersecurity',
    'qa_testing',
    'marketing',
    'sales',
    'hr',
    'finance',
    'design',
    'content_writing',
    'project_management',
    'other',
] as const

export type InterestCategory = typeof INTEREST_CATEGORIES[number]
export type fileAttributtes = {
    public_id: string;
    secure_url: string;
}
export interface IEducation {
    institution: string;
    degree: string;
    field: string;
    grade: string;
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
    categories?: InterestCategory[];
}