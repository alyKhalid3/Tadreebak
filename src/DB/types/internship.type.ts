import { Types } from "mongoose";
import { IQuestion } from "./question.type";



export enum WorkingTimeEnum {
    FULL_TIME = 'full-time',
    PART_TIME = 'part-time',
}
export enum LocationEnum {
    on_site = 'on-site',
    remote = 'remote',
    hybrid = 'hybrid'
}

export interface IInternShip {
    title: string;
    location: string;
    workingTime: string;
    description: string;
    softSkills: string[];
    technicalSkills: string[];
    addedBy: Types.ObjectId;
    updatedBy: Types.ObjectId;
    closed: boolean;
    companyId: Types.ObjectId;
    questions?: IQuestion[];
}