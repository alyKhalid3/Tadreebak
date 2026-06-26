import { Model } from "mongoose";
import { DBRepo } from "../DBRepo";
import { IApplication } from "../types/application.type";
import { ApplicationModel } from "../models/application.model";



export class ApplicationRepo extends DBRepo<IApplication> {

    constructor(protected override readonly model: Model<IApplication> = ApplicationModel) {
        super(model);
    }
}
