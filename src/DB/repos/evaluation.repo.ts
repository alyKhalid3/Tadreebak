import { Model } from "mongoose"
import { DBRepo } from "../DBRepo"
import { IEvaluation } from "../types/evaluation.type"
import { EvaluationModel } from "../models/evaluation.model"

export class EvaluationRepo extends DBRepo<IEvaluation> {
    constructor(
        protected override readonly model: Model<IEvaluation> = EvaluationModel,
    ) {
        super(model)
    }
}
