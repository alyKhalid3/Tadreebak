
import { Types } from "mongoose"

export enum UserRoleEnum {
    ADMIN = 'admin',
    USER = 'user',
    STUDENT = 'student',
    COMPANY_OWNER = 'company_owner',
    // `intern` is set when an accepted application promotes the user from
    // `student` to an active intern at a company. One-company-at-a-time —
    // an intern can only be enrolled at one company; a second accepted
    // application is rejected (enforced in application.service.accept).
    INTERN = 'intern',
}
export type otp = {
    otp: string;
    expiresAt: Date;
    attempts?: number;
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

export type InterestCategory = string
export type fileAttributtes = {
    public_id: string;
    secure_url: string;
    resourceType?: 'image' | 'raw';
}
export interface ICourse {
    name: string;
    certificate?: fileAttributtes;
    // Optional date window for the course — when the student took it.
    // `present: true` means the course is still in progress and `endDate`
    // is ignored in that case.
    startDate?: Date;
    endDate?: Date | null;
    present?: boolean;
    description?: string;
}
export interface IEducation {
    institution: string;
    degree: string;
    field: string;
    grade: string;
    startDate: Date;
    endDate?: Date;
    // Optional free-text notes — coursework, thesis, honors, etc.
    description?: string;
}
export interface IExperience {
    company: string;
    title: string;
    description?: string;
    startDate: Date;
    endDate?: Date;
}

/**
 * Where a skill came from. `sourceRef` is the friendly name of the
 * source — the educational institution, the internship title, or a
 * free-text label when `source === 'other'`.
 */
export enum SkillSourceEnum {
    SELF = 'self',
    EDUCATION = 'education',
    INTERNSHIP = 'internship',
    OTHER = 'other',
}

export interface ISkill {
    name: string;
    source: SkillSourceEnum;
    sourceRef: string;
    description?: string;
}

/**
 * Public social links a student publishes on their profile. The
 * `platform` field is a free-text label so we can support any
 * platform the frontend wants (LinkedIn, GitHub, Behance, ...).
 */
export interface ISocial {
    platform: string;
    url: string;
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
    // Skills support both shapes for backward compat:
    //   - `string`         — the original plain tag ("React")
    //   - `ISkill` object  — enriched form with `source`, `sourceRef`,
    //                        optional `description`
    // We accept either on PATCH and return whatever was stored on GET.
    // New writes should prefer the object form; old data is read as-is.
    skills?: (string | ISkill)[];
    education?: IEducation[];
    experience?: IExperience[];
    courses?: ICourse[];
    // Public social links — LinkedIn / GitHub / portfolio / etc.
    socials?: ISocial[];
    resume?: fileAttributtes;
    dateOfBirth?: Date;
    gender?: 'male' | 'female';
    address?: string;
    categories?: InterestCategory[];
    // `avgRating` is NOT persisted — it is computed on read from
    // `ratingSum / ratingCount` (see utils/avgRating.ts). Storing it
    // would require a non-atomic read-modify-write, which is racy.
    ratingCount: number
    ratingSum?: number

    // ---- Intern enrollments (multi-company model) ----
    // A user can be enrolled at multiple companies. Each enrollment has
    // its own per-company state (status, points, dates). The list is
    // the source of truth — the legacy fields below are populated for
    // existing users by the migration script and stay readable for
    // backwards compat but new code MUST write to enrollments[].
    //
    // Indexes: see user.model.ts for the { companyId, status } compound
    // that powers the per-company roster query.
    enrollments?: IEnrollment[]
    // Legacy single-company fields. Kept for the migration window.
    // New code reads `enrollments[]` via the helper in
    // src/utils/enrollment.ts.
    //
    // `enrolledAt` is set when the user's first application is accepted;
    // `enrollmentCompanyId` is the only company they can be an intern at.
    // The pair is removed (set to null) when the program completes and the
    // user transitions to "alumni" (Phase 3 — intern self-service).
    enrolledAt?: Date
    enrollmentCompanyId?: Types.ObjectId
    // Cumulative gamification total — written on every PointTransaction via
    // `$inc` so the leaderboard can sort without an aggregation.
    totalPoints?: number
    // The window of the intern's active engagement. Set on enroll, cleared
    // when the program ends. `internshipEndDate = null` means "still active".
    internshipStartDate?: Date
    internshipEndDate?: Date | null
}

// One per (user, company) pair. A user can have many of these — one
// per company they're interned at. The `status` field is the
// lifecycle: `active` while they're working, `completed` when the
// program ends, `withdrawn` if they leave early.
//
// `totalPoints` is per-company. The leaderboard (Phase 5) reads
// `enrollments[].totalPoints` filtered by companyId — no cross-
// company contamination.
export enum EnrollmentStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    WITHDRAWN = 'withdrawn',
}

export interface IEnrollment {
    _id?: Types.ObjectId
    companyId: Types.ObjectId
    status: EnrollmentStatus
    enrolledAt: Date
    internshipStartDate: Date
    // null while the intern is still active at this company. Set when
    // the program ends or they withdraw.
    internshipEndDate: Date | null
    // Per-company points total. Defaults to 0 on enroll. Incremented
    // by the points engine (Phase 5).
    totalPoints: number
}