import type { DeliveryPaymentMethod } from "@prisma/client";

import { inferExpectedPaymentMethod } from "@/lib/mobile/payment";

export type RiderOpsPaymentLine = {
  paymentMethod: string;
  amount: string;
};

export type RiderOpsPaymentDisplay = {
  expectedAmount: string;
  collectedAmount: string | null;
  paymentMethod: string | null;
  collectionStatus: string | null;
  paymentLines: RiderOpsPaymentLine[];
  /** payment = rider/app DeliveryPayment; order_total = fallback from order.totalPrice */
  amountSource: "payment" | "order_total";
};

function toMoney(value: { toString(): string } | null | undefined) {
  return value?.toString() ?? "0.00";
}

type DeliveryPaymentLike = {
  expectedAmount: { toString(): string };
  collectedAmount: { toString(): string };
  paymentMethod: DeliveryPaymentMethod | string;
  collectionStatus: string;
  lines: Array<{
    paymentMethod: DeliveryPaymentMethod | string;
    amount: { toString(): string };
  }>;
};

type OrderPaymentInferLike = {
  totalPrice: { toString(): string };
  financialStatus?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
};

/**
 * Prefer recorded DeliveryPayment; otherwise use order total + gateway inference
 * so link / fulfillment / app completes without a payment POST still show amounts.
 */
export function resolveRiderOpsPaymentDisplay(input: {
  deliveryPayment: DeliveryPaymentLike | null | undefined;
  order: OrderPaymentInferLike;
}): RiderOpsPaymentDisplay {
  const payment = input.deliveryPayment;
  if (payment) {
    const lines = payment.lines ?? [];
    const paymentMethodLabel =
      lines.length > 1
        ? lines.map((line) => String(line.paymentMethod)).join("+")
        : String(payment.paymentMethod);

    return {
      expectedAmount: toMoney(payment.expectedAmount),
      collectedAmount: toMoney(payment.collectedAmount),
      paymentMethod: paymentMethodLabel,
      collectionStatus: payment.collectionStatus,
      paymentLines: lines.map((line) => ({
        paymentMethod: String(line.paymentMethod),
        amount: toMoney(line.amount),
      })),
      amountSource: "payment",
    };
  }

  const orderTotal = toMoney(input.order.totalPrice);
  const method = inferExpectedPaymentMethod({
    financialStatus: input.order.financialStatus ?? null,
    paymentGatewayPrimary: input.order.paymentGatewayPrimary ?? null,
    paymentGatewayNames: input.order.paymentGatewayNames ?? [],
  });

  return {
    expectedAmount: orderTotal,
    collectedAmount: null,
    paymentMethod: method,
    collectionStatus: null,
    paymentLines: [],
    amountSource: "order_total",
  };
}
