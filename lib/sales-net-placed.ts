import type { Prisma } from "@prisma/client";

import { formatAppIsoDate } from "@/lib/format-datetime";

/** Orders that can contribute to SMS / dashboard All orders net sales. */
export type SalesNetPlacedOrder = {
  createdAt: Date;
  cancelledAt?: Date | null;
  financialStatus?: string | null;
  fulfillmentStage?: string | null;
  fulfillmentStageEnteredAt?: Date | null;
  totalPrice?: unknown;
  returnDate?: Date | null;
};

export type SalesNetContribution = {
  signedAmount: number;
  /** +1 placed in range (not same-day reverse). Deducts change amount only. */
  includeInCount: 0 | 1;
};

const REVERSED_STATUSES = new Set(["voided", "refunded", "cancelled"]);
const RETURNED_STAGES = new Set(["returned", "returned_to_store"]);

function normalizeStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isCreditNoteSale(order: { totalPrice?: unknown }): boolean {
  const amount = Number(order.totalPrice ?? 0);
  return Number.isFinite(amount) && amount < 0;
}

export function isReversedSale(order: {
  cancelledAt?: Date | null;
  financialStatus?: string | null;
  fulfillmentStage?: string | null;
}): boolean {
  if (order.cancelledAt) return true;
  if (REVERSED_STATUSES.has(normalizeStatus(order.financialStatus))) return true;
  return RETURNED_STAGES.has(normalizeStatus(order.fulfillmentStage));
}

/** Cancel / return / void day — earliest timestamp we have. */
export function saleReversalAt(order: SalesNetPlacedOrder): Date | null {
  if (!isReversedSale(order)) return null;
  const dates = [order.cancelledAt, order.returnDate];
  if (
    RETURNED_STAGES.has(normalizeStatus(order.fulfillmentStage)) ||
    REVERSED_STATUSES.has(normalizeStatus(order.financialStatus))
  ) {
    dates.push(order.fulfillmentStageEnteredAt ?? null);
  }
  const valid = dates.filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
  if (valid.length === 0) return null;
  valid.sort((left, right) => left.getTime() - right.getTime());
  return valid[0] ?? null;
}

/**
 * Net sales for a Colombo date range:
 * - placed in range, paid or unpaid, unless cancelled/returned/voided that same day
 * - minus orders placed on an earlier day and cancelled/returned/voided in range
 * - credit notes never add
 */
export function salesNetContribution(
  order: SalesNetPlacedOrder,
  fromYmd: string,
  toYmd: string,
): SalesNetContribution {
  if (isCreditNoteSale(order)) return { signedAmount: 0, includeInCount: 0 };
  const amount = Number(order.totalPrice ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return { signedAmount: 0, includeInCount: 0 };

  const createdYmd = formatAppIsoDate(order.createdAt);
  if (!createdYmd) return { signedAmount: 0, includeInCount: 0 };

  const reverseYmd = formatAppIsoDate(saleReversalAt(order));
  const placedInRange = createdYmd >= fromYmd && createdYmd <= toYmd;
  const sameDayReverse = Boolean(reverseYmd && reverseYmd === createdYmd);
  const deductInRange = Boolean(
    reverseYmd && reverseYmd >= fromYmd && reverseYmd <= toYmd && reverseYmd > createdYmd,
  );

  let signedAmount = 0;
  let includeInCount: 0 | 1 = 0;
  if (placedInRange && !sameDayReverse) {
    signedAmount += amount;
    includeInCount = 1;
  }
  if (deductInRange) signedAmount -= amount;
  return { signedAmount, includeInCount };
}

export function salesNetPlacedWhere(
  companyId: string,
  fromDate: Date,
  toDate: Date,
): Prisma.OrderWhereInput {
  return {
    companyId,
    OR: [
      { createdAt: { gte: fromDate, lte: toDate } },
      { cancelledAt: { gte: fromDate, lte: toDate } },
      {
        fulfillmentStage: { in: ["returned", "returned_to_store"] },
        fulfillmentStageEnteredAt: { gte: fromDate, lte: toDate },
      },
      { returns: { some: { returnDate: { gte: fromDate, lte: toDate } } } },
    ],
  };
}
