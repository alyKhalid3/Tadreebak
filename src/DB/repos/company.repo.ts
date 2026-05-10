import { Model } from "mongoose";
import { DBRepo } from "../DBRepo";
import { ICompany } from "../types/company.type";
import { companyModel } from "../models/company.model";







export class CompanyRepo extends DBRepo<ICompany> {
    constructor(protected override readonly model: Model<ICompany> = companyModel) {
        super(model);
    }
}