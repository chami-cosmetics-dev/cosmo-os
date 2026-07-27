import type { DeliveryPaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

type AmountLike = Prisma.Decimal | number | string;

function toDecimal(value: AmountLike): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

/** Cash amount due for tender/change (COD lines or single COD collection). */
export function cashDueFromPayment(payment: {
  paymentMethod: DeliveryPaymentMethod;
  collectedAmount: AmountLike;
  lines?: Array<{ paymentMethod: DeliveryPaymentMethod; amount: AmountLike }>;
}): Prisma.Decimal {
  if (payment.lines && payment.lines.length > 0) {
    return payment.lines
      .filter((line) => line.paymentMethod === "cod")
      .reduce((sum, line) => sum.add(toDecimal(line.amount)), new Prisma.Decimal(0));
  }
  if (payment.paymentMethod === "cod") {
    return toDecimal(payment.collectedAmount);
  }
  return new Prisma.Decimal(0);
}

export function computeChangeAmount(customerGave: AmountLike, cashDue: AmountLike): Prisma.Decimal {
  const change = toDecimal(customerGave).sub(toDecimal(cashDue));
  if (change.lt(0)) {
    return new Prisma.Decimal(0);
  }
  return change.toDecimalPlaces(2);
}

export function assertCustomerGaveCoversCashDue(params: {
  customerGaveAmount: number | null | undefined;
  cashDue: number;
}): { ok: true; customerGave: number; change: number } | { ok: false; error: string } {
  const cashDue = Number.isFinite(params.cashDue) ? params.cashDue : 0;
  if (cashDue <= 0.001) {
    return { ok: true, customerGave: 0, change: 0 };
  }
  if (params.customerGaveAmount == null || !Number.isFinite(params.customerGaveAmount)) {
    return { ok: false, error: "Customer gave amount is required for cash collection" };
  }
  if (params.customerGaveAmount + 0.001 < cashDue) {
    return { ok: false, error: "Customer gave amount must cover the cash due" };
  }
  const change = Number(computeChangeAmount(params.customerGaveAmount, cashDue).toString());
  return { ok: true, customerGave: params.customerGaveAmount, change };
}
