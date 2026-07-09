import mongoose from "mongoose";
import { IPaymentOrder, PaymentOrderStatus } from "../types/paymentOrder.type";

export const paymentOrderSchema = new mongoose.Schema<IPaymentOrder>({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    planId: { type: String, required: true },
    credits: { type: Number, required: true },
    amountCents: { type: Number, required: true },
    paymobOrderId: { type: String, default: '' },
    status: { type: String, enum: PaymentOrderStatus, default: PaymentOrderStatus.PENDING, required: true },
    paidAt: { type: Date },
}, { timestamps: true });

export const PaymentOrderModel = mongoose.model<IPaymentOrder>('PaymentOrder', paymentOrderSchema);
