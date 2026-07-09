import { Model } from "mongoose";
import { DBRepo } from "../DBRepo";
import { IPaymentOrder } from "../types/paymentOrder.type";
import { PaymentOrderModel } from "../models/paymentOrder.model";

export class PaymentOrderRepo extends DBRepo<IPaymentOrder> {
    constructor(protected override readonly model: Model<IPaymentOrder> = PaymentOrderModel) {
        super(model);
    }
}
