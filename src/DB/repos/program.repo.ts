import { Model } from "mongoose"
import { DBRepo } from "../DBRepo"
import { IProgram } from "../types/program.type"
import { ProgramModel } from "../models/program.model"

// Standard pattern (see CompanyRepo). Thin wrapper around DBRepo so the
// service layer has type-safe access to the Model.
export class ProgramRepo extends DBRepo<IProgram> {
    constructor(protected override readonly model: Model<IProgram> = ProgramModel) {
        super(model)
    }
}
