import { Types } from "mongoose";
import { fileAttributtes } from "./user.type";
import { IAnswer } from "./question.type";



export enum ApplicationStatus {
    PENDING = 'pending',
    ACCEPTED = 'accepted',
    REJECTED = 'rejected',
}

export interface IApplication {
    internshipId: Types.ObjectId;
    studentId: Types.ObjectId;
    status: ApplicationStatus;
    coverLetter?: string;
    // snapshot of the student's resume at the time of applying, so the company
    // always sees what was submitted even if the student later changes it.
    resume: fileAttributtes;
    reviewedBy?: Types.ObjectId;
    answers?: IAnswer[];
    completed: boolean;
}
