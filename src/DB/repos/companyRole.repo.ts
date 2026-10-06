// Phase 18B / CompanyRole repo.
//
// Thin wrapper over the model for the few operations the
// service layer needs that the generic DBRepo doesn't cover
// (find by company + name, list active by company, etc.).
import { FlattenMaps, HydratedDocument, Model, QueryOptions } from "mongoose"
import { DBRepo } from "../DBRepo"
import { ICompanyRole } from "../types/companyRole.type"
import { CompanyRoleModel } from "../models/companyRole.model"

export class CompanyRoleRepo extends DBRepo<ICompanyRole> {
    constructor(protected override readonly model: Model<ICompanyRole> = CompanyRoleModel) {
        super(model)
    }

    findByCompanyAndName = async ({
        companyId,
        name,
    }: {
        companyId: string
        name: string
    }): Promise<FlattenMaps<HydratedDocument<ICompanyRole>> | HydratedDocument<ICompanyRole> | null> => {
        return this.model.findOne({ companyId, name })
    }

    listByCompany = async ({
        companyId,
        options,
    }: {
        companyId: string
        options?: QueryOptions<ICompanyRole>
    }) => {
        return this.model.find({ companyId }, undefined, options)
    }
}