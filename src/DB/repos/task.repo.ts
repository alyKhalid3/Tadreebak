import { Model } from "mongoose"
import { DBRepo } from "../DBRepo"
import { ITask } from "../types/task.type"
import { TaskModel } from "../models/task.model"

// Standard pattern (see CompanyRepo). Thin wrapper around DBRepo so the
// service layer has type-safe access to the Model.
export class TaskRepo extends DBRepo<ITask> {
    constructor(protected override readonly model: Model<ITask> = TaskModel) {
        super(model)
    }
}
