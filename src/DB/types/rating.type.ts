import { Types } from "mongoose";

export enum RatingFrom {
    STUDENT = 'STUDENT',
    COMPANY = 'COMPANY',
}

export enum RatingTarget {
    STUDENT = 'STUDENT',
    COMPANY = 'COMPANY',
}

export interface IRating {
    applicationId: Types.ObjectId;
    from: RatingFrom;
    raterId: Types.ObjectId;
    targetType: RatingTarget;
    targetId: Types.ObjectId;
    score: number;
    comment?: string;
    createdAt: Date;
}
