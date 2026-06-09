import { ObjectId } from "mongoose";




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
    addedBy: ObjectId;
    updatedBy: ObjectId;
    closed: boolean;
    companyId: string;
}