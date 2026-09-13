import mongoose, { Schema, Types } from "mongoose"
import { IAttendanceSchedule } from "../types/attendanceSchedule.type"

const weeklyPatternSchema = new Schema(
    {
        sunday: { type: Boolean, required: true, default: false },
        monday: { type: Boolean, required: true, default: false },
        tuesday: { type: Boolean, required: true, default: false },
        wednesday: { type: Boolean, required: true, default: false },
        thursday: { type: Boolean, required: true, default: false },
        friday: { type: Boolean, required: true, default: false },
        saturday: { type: Boolean, required: true, default: false },
    },
    { _id: false },
)

const attendanceScheduleSchema = new mongoose.Schema<IAttendanceSchedule>(
    {
        companyId: {
            type: Schema.Types.ObjectId,
            ref: "Company",
            required: true,
            index: true,
        },
        // Sparse unique so a single company can have at most one
        // schedule with programId=null (the default) and at most one
        // per programId. The combination is the uniqueness key.
        programId: {
            type: Schema.Types.ObjectId,
            ref: "Program",
            default: null,
        },
        weeklyPattern: {
            type: weeklyPatternSchema,
            required: true,
        },
        effectiveFrom: { type: Date },
        effectiveTo: { type: Date, default: null },
    },
    { timestamps: true },
)

// One schedule per (companyId, programId). The partialFilter handles
// the null programId case so we don't store duplicates of the
// company default.
attendanceScheduleSchema.index(
    { companyId: 1, programId: 1 },
    {
        unique: true,
        // `programId: null` is the company default — treat the pair
        // (companyId, null) as a unique key too.
        partialFilterExpression: {
            $or: [{ programId: null }, { programId: { $exists: true } }],
        },
    },
)

export const AttendanceScheduleModel = mongoose.model<IAttendanceSchedule>(
    "AttendanceSchedule",
    attendanceScheduleSchema,
)
