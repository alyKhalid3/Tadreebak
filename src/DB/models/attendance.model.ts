import mongoose, { Schema, Types } from "mongoose"
import { AttendanceStatus, IAttendance } from "../types/attendance.type"

const attendanceSchema = new mongoose.Schema<IAttendance>(
    {
        internId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        companyId: {
            type: Schema.Types.ObjectId,
            ref: "Company",
            required: true,
            index: true,
        },
        date: { type: String, required: true }, // YYYY-MM-DD (company TZ)
        status: {
            type: String,
            enum: AttendanceStatus,
            default: AttendanceStatus.ATTENDED,
            required: true,
        },
        note: { type: String, maxlength: 500 },
        pointsAwarded: { type: Boolean, default: false },
    },
    { timestamps: true },
)

// One row per intern per day. The unique compound on (internId, date)
// makes a second mark the same day fail with E11000, which the
// service translates into an upsert.
attendanceSchema.index({ internId: 1, date: 1 }, { unique: true })
// For the admin's date-range scans.
attendanceSchema.index({ companyId: 1, date: 1 })
attendanceSchema.index({ companyId: 1, status: 1, date: 1 })

export const AttendanceModel = mongoose.model<IAttendance>(
    "Attendance",
    attendanceSchema,
)
