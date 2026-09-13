import { Model } from "mongoose"
import { DBRepo } from "../DBRepo"
import { IAttendanceSchedule } from "../types/attendanceSchedule.type"
import { AttendanceScheduleModel } from "../models/attendanceSchedule.model"

export class AttendanceScheduleRepo extends DBRepo<IAttendanceSchedule> {
    constructor(
        protected override readonly model: Model<IAttendanceSchedule> = AttendanceScheduleModel,
    ) {
        super(model)
    }
}
