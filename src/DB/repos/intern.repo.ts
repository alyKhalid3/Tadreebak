import { Model } from "mongoose";
import { DBRepo } from "../DBRepo";
import { IInternShip } from "../types/internship.type";
import { InternShipModel } from "../models/internship.model";





export class InternRepo extends DBRepo<IInternShip> {


    constructor(protected override readonly model: Model<IInternShip> = InternShipModel) {
        super(model);
    }
}