import type { DeliveryPaymentMethod } from "@prisma/client";

import {
  formatApprovalSplitAmountBreakdown,
  sortApprovalSplitLines,
} from "@/lib/approval-payment-split";
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

type SplitLineLike = {
  paymentMethod: string;
  amount: number | string | { toString(): string };
};

type OrderPaymentInferLike = {
  totalPrice: { toString(): string };
  financialStatus?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  collectCashAmount?: number | null;
  splitLines?: SplitLineLike[];
};

export type RiderLocationPaymentTotals = {
  cashTotal: number;
  kokoTotal: number;
  bankTransferTotal: number;
  cardTotal: number;
  alreadyPaidTotal: number;
  collectedTotal: number;
};

function lineAmount(value: number | string | { toString(): string } | null | undefined) {
  const parsed = Number.parseFloat(value?.toString() ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function addPaymentMethodTotal(
  current: RiderLocationPaymentTotals,
  method: string,
  amount: number,
) {
  const key = method.toLowerCase();
  if (key === "cod" || key === "cash") current.cashTotal += amount;
  else if (key === "koko") current.kokoTotal += amount;
  else if (key === "bank_transfer") current.bankTransferTotal += amount;
  else if (key === "card") current.cardTotal += amount;
  else if (key === "already_paid") current.alreadyPaidTotal += amount;
}

/** Location totals. Split lines keep KOKO paid and cash to collect apart. */
export function accumulateRiderLocationPayment(
  current: RiderLocationPaymentTotals,
  row: {
    expectedAmount: string;
    collectedAmount: string | null;
    paymentMethod: string | null;
    paymentLines?: RiderOpsPaymentLine[];
  },
) {
  const lines = row.paymentLines ?? [];
  if (lines.length > 1) {
    for (const line of lines) {
      addPaymentMethodTotal(current, line.paymentMethod, lineAmount(line.amount));
    }
    current.collectedTotal += lines.reduce((sum, line) => sum + lineAmount(line.amount), 0);
    return;
  }

  const amount = lineAmount(row.collectedAmount ?? row.expectedAmount);
  current.collectedTotal += amount;
  if (lines.length === 1) {
    addPaymentMethodTotal(current, lines[0].paymentMethod, lineAmount(lines[0].amount));
    return;
  }
  addPaymentMethodTotal(current, row.paymentMethod ?? "", amount);
}

export function riderOpsRowAmount(row: {
  expectedAmount: string;
  collectedAmount: string | null;
  paymentLines?: RiderOpsPaymentLine[];
}): string {
  const lines = row.paymentLines ?? [];
  if (lines.length > 1) return row.expectedAmount;
  return row.collectedAmount ?? row.expectedAmount;
}

/**
 * Prefer recorded DeliveryPayment; otherwise use order total + gateway inference
 * so link / fulfillment / app completes without a payment POST still show amounts.
 */
export function resolveRiderOpsPaymentDisplay(input: {
  deliveryPayment: DeliveryPaymentLike | null | undefined;
  order: OrderPaymentInferLike;
}): RiderOpsPaymentDisplay {
  const splitLines = sortApprovalSplitLines(input.order.splitLines ?? []).map((line) => ({
    paymentMethod: line.paymentMethod,
    amount: lineAmount(line.amount),
  }));
  const splitLabel = formatApprovalSplitAmountBreakdown(splitLines);
  const payment = input.deliveryPayment;
  if (splitLabel) {
    const total = splitLines.reduce((sum, line) => sum + line.amount, 0);
    return {
      expectedAmount: total.toFixed(2),
      collectedAmount: payment ? toMoney(payment.collectedAmount) : null,
      paymentMethod: splitLabel,
      collectionStatus: payment?.collectionStatus ?? null,
      paymentLines: splitLines.map((line) => ({
        paymentMethod: line.paymentMethod,
        amount: line.amount.toFixed(2),
      })),
      amountSource: payment ? "payment" : "order_total",
    };
  }

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

  const cashDue = input.order.collectCashAmount;
  const orderTotal =
    cashDue != null && cashDue > 0 ? cashDue.toFixed(2) : toMoney(input.order.totalPrice);
  const method =
    cashDue != null && cashDue > 0
      ? "cod"
      : inferExpectedPaymentMethod({
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
