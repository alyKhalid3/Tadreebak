import { Model } from "mongoose"
import { DBRepo } from "../DBRepo"
import { IAttendance } from "../types/attendance.type"
import { AttendanceModel } from "../models/attendance.model"

// Standard pattern (see CompanyRepo). Thin wrapper around DBRepo so the
// service layer has type-safe access to the Model.
export class AttendanceRepo extends DBRepo<IAttendance> {
    constructor(
        protected override readonly model: Model<IAttendance> = AttendanceModel,
    ) {
        super(model)
    }
}
