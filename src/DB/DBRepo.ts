import { HydratedDocument, Model, QueryOptions, FlattenMaps, ObjectId, UpdateQuery, MongooseBaseQueryOptionKeys, MongooseBaseQueryOptions, UpdateWriteOpResult, Document } from "mongoose";
import { IUser } from "./types/user.type";
import { DeleteOptions, UpdateOptions } from "mongodb";
import { Filter } from "mongodb/src";

export abstract class DBRepo<T> {
  constructor(protected readonly model: Model<T>) { }

  create = async ({ data }: { data: Partial<T> }): Promise<HydratedDocument<T>> => {
    const doc = await this.model.create(data)
    return doc
  }
  find = async ({ filter, projection, options }:
      { filter: Filter<T>, projection?: string, options?: QueryOptions<T> }): Promise<Array<FlattenMaps<HydratedDocument<T>> | HydratedDocument<T>>> => {
    const query = this.model.find(filter, projection, options)
    if (options?.lean) {
      query.lean()
    }
    const doc = await query.exec()
    return doc
  }
  findOne = async ({ filter, projection, options }:
      { filter: Filter<T>, projection?: string, options?: QueryOptions<T> }): Promise<FlattenMaps<HydratedDocument<T>> | HydratedDocument<T> | null> => {
    let query = this.model.findOne(filter, projection, options)
    if (options?.populate) {
     query.populate(options.populate as any)
    }
    if (options?.lean) {
      query.lean()
    }
    const doc = await query.exec()
    return doc
  }
  update = async ({ filter,data, options }: { filter: Filter<T>; data: UpdateQuery<T>; options?: QueryOptions<T>; }): Promise<FlattenMaps<HydratedDocument<T>> | HydratedDocument<T> | null> => {
    const query = this.model.findOneAndUpdate(filter, data, options)
    if (options?.lean) {
      query.lean()
    }
    const doc = await query.exec()
    return doc
  }
    updateMany = async ({ filter,data, options }: { filter: Filter<T>; data: UpdateQuery<T>; options?:UpdateOptions & MongooseBaseQueryOptions<T>; }): Promise<FlattenMaps<HydratedDocument<T>> | HydratedDocument<T> | UpdateWriteOpResult|null> => {
    const query = this.model.updateMany(filter, data,options)
    const doc = await query.exec()
    return doc
  }
  findById =async ({ id, projection, options }:
    { id: string, projection?: string, options?: QueryOptions<T> }): Promise<FlattenMaps<HydratedDocument<T>> | HydratedDocument<T> | null> => {
    const query = this.model.findById(id, projection, options)
    if (options?.lean) {
      query.lean()
    }
    const doc = await query.exec()
    return doc
  }
  deleteMany = async ({ filter,options }:
      { filter: Filter<T>, options?:(DeleteOptions & MongooseBaseQueryOptions<T>) | null }): Promise<any> => {
    const query = this.model.deleteMany(filter,options)
    const doc = await query.exec()
    return doc
  }

}