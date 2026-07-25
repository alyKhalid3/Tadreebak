import { Model } from "mongoose";
import { DBRepo } from "../DBRepo";
import { IRating } from "../types/rating.type";
import { RatingModel } from "../models/rating.model";

export class RatingRepo extends DBRepo<IRating> {
    constructor(protected override readonly model: Model<IRating> = RatingModel) {
        super(model);
    }
}
