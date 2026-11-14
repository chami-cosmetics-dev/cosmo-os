import type { Prisma } from "@prisma/client";
import { formatBusinessOrderNumber } from "@/lib/order-display-label";

type OrderRef = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
  totalPrice: Prisma.Decimal | { toString(): string };
};

export function orderDisplayLabel(order: Pick<OrderRef, "name" | "orderNumber" | "shopifyOrderId">) {
  return formatBusinessOrderNumber(order);
}

/** Every exchange delivery needs old-item pickup confirmation on the rider app. */
export function requiresOldItemCollection(_reason?: string) {
  return true;
}

export function calculateExchangePaymentDifference(input: {
  originalOrder?: Pick<OrderRef, "totalPrice"> | null;
  replacementOrder?: Pick<OrderRef, "totalPrice"> | null;
}) {
  if (!input.originalOrder || !input.replacementOrder) {
    return null;
  }

  const replacementTotal = Number(input.replacementOrder.totalPrice.toString());
  const originalTotal = Number(input.originalOrder.totalPrice.toString());
  if (!Number.isFinite(replacementTotal) || !Number.isFinite(originalTotal)) {
    return null;
  }

  return (replacementTotal - originalTotal).toFixed(2);
}

