import { Model } from "mongoose"
import { DBRepo } from "../DBRepo"
import { IProject } from "../types/project.type"
import { ProjectModel } from "../models/project.model"

export class ProjectRepo extends DBRepo<IProject> {
    constructor(protected override readonly model: Model<IProject> = ProjectModel) {
        super(model)
    }
}
