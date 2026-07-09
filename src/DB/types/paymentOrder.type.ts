import { Types } from "mongoose";

export enum PaymentOrderStatus {
    PENDING = 'pending',
    PAID = 'paid',
    FAILED = 'failed',
}

export interface IPaymentOrder {
    companyId: Types.ObjectId;
    planId: string;
    credits: number;
    amountCents: number;
    paymobOrderId: string;
    status: PaymentOrderStatus;
    paidAt?: Date;
}
