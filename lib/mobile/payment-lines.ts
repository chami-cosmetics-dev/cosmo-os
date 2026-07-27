import type { DeliveryPaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type RiderPaymentLineInput = {
  paymentMethod: DeliveryPaymentMethod;
  amount: number;
  bankReference?: string | null;
  cardReference?: string | null;
  referenceNote?: string | null;
};

/** Normalize legacy single-method payload or explicit lines into payment lines. */
export function normalizePaymentLines(input: {
  paymentMethod?: DeliveryPaymentMethod;
  collectedAmount?: number;
  bankReference?: string | null;
  cardReference?: string | null;
  referenceNote?: string | null;
  lines?: RiderPaymentLineInput[];
}): RiderPaymentLineInput[] {
  if (input.lines && input.lines.length > 0) {
    return input.lines.map((line) => ({
      paymentMethod: line.paymentMethod,
      amount: line.amount,
      bankReference: line.bankReference?.trim() || null,
      cardReference: line.cardReference?.trim() || null,
      referenceNote: line.referenceNote?.trim() || null,
    }));
  }

  if (!input.paymentMethod || input.collectedAmount == null) {
    return [];
  }

  return [
    {
      paymentMethod: input.paymentMethod,
      amount: input.collectedAmount,
      bankReference: input.bankReference?.trim() || null,
      cardReference: input.cardReference?.trim() || null,
      referenceNote: input.referenceNote?.trim() || null,
    },
  ];
}

export function sumPaymentLineAmounts(lines: RiderPaymentLineInput[]): number {
  return lines.reduce((sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0), 0);
}

/** Header fields kept for backward-compatible readers (primary = largest line). */
export function derivePaymentHeaderFromLines(lines: RiderPaymentLineInput[]): {
  paymentMethod: DeliveryPaymentMethod;
  collectedAmount: number;
  bankReference: string | null;
  cardReference: string | null;
  referenceNote: string | null;
} {
  const sorted = [...lines].sort((a, b) => b.amount - a.amount);
  const primary = sorted[0];
  return {
    paymentMethod: primary.paymentMethod,
    collectedAmount: sumPaymentLineAmounts(lines),
    bankReference: primary.bankReference ?? null,
    cardReference: primary.cardReference ?? null,
    referenceNote: primary.referenceNote ?? null,
  };
}

export function cashAmountFromDeliveryPayment(payment: {
  paymentMethod: DeliveryPaymentMethod;
  collectedAmount: Prisma.Decimal | number | string;
  lines?: Array<{ paymentMethod: DeliveryPaymentMethod; amount: Prisma.Decimal | number | string }>;
}): Prisma.Decimal {
  if (payment.lines && payment.lines.length > 0) {
    return payment.lines
      .filter((line) => line.paymentMethod === "cod")
      .reduce(
        (sum, line) => sum.add(new Prisma.Decimal(line.amount.toString())),
        new Prisma.Decimal(0)
      );
  }
  if (payment.paymentMethod === "cod") {
    return new Prisma.Decimal(payment.collectedAmount.toString());
  }
  return new Prisma.Decimal(0);
}

export function deliveryPaymentHasCash(payment: {
  paymentMethod: DeliveryPaymentMethod;
  lines?: Array<{ paymentMethod: DeliveryPaymentMethod }>;
}): boolean {
  if (payment.lines && payment.lines.length > 0) {
    return payment.lines.some((line) => line.paymentMethod === "cod");
  }
  return payment.paymentMethod === "cod";
}
