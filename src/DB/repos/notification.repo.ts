import { Model, Types } from "mongoose";
import { DBRepo } from "../DBRepo";
import { INotification } from "../types/notification.type";
import { NotificationModel } from "../models/notification.model";



export class NotificationRepo extends DBRepo<INotification> {

    constructor(protected override readonly model: Model<INotification> = NotificationModel) {
        super(model);
    }

    // Mark many of the recipient's notifications as read in one round-trip.
    // The recipientId guard ensures a caller can't flip someone else's rows.
    markManyRead = async ({ ids, recipientId }: { ids: Types.ObjectId[] | string[], recipientId: string }): Promise<number> => {
        const result = await this.model.updateMany(
            { _id: { $in: ids }, recipient: recipientId },
            { $set: { read: true } },
        )
        return result.modifiedCount
    }
}
