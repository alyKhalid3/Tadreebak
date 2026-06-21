import mongoose from "mongoose";
import { IInternShip, LocationEnum, WorkingTimeEnum } from "../types/internship.type";





export const internshipSchema = new mongoose.Schema<IInternShip>({
    title: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, enum: LocationEnum, default: LocationEnum.on_site, required: true },
    workingTime: { type: String, enum: WorkingTimeEnum, default: WorkingTimeEnum.FULL_TIME, required: true },
    softSkills: { type: [String], required: true },
    technicalSkills: { type: [String], required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    closed: { type: Boolean, default: false },
    companyId: { type: String, required: true, ref: 'Company' }
}, { timestamps: true });

export const InternShipModel = mongoose.model('InternShip', internshipSchema);