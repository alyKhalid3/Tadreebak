import { Model } from "mongoose";
import { DBRepo } from "../DBRepo";
import { ISavedInternship } from "../types/savedInternship.type";
import { SavedInternshipModel } from "../models/savedInternship.model";




export class SavedInternshipRepo extends DBRepo<ISavedInternship> {

    constructor(protected override readonly model: Model<ISavedInternship> = SavedInternshipModel) {
        super(model);
    }
}
