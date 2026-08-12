/**
 * Lifetime placed-order total for loyalty.
 * Pure reducers are unit-tested; loaders live alongside for API use.
 */

/** Fulfillment stages that count toward customer lifetime spend (OSF completed-sale rules). */
export const CUSTOMER_LIFETIME_TOTAL_FULFILLMENT_STAGES = [
  "delivery_complete",
  "invoice_complete",
] as const;

export type OrderAmountInput = {
  totalPrice: number | string;
  cancelledAt: Date | string | null;
  financialStatus?: string | null;
  fulfillmentStage?: string | null;
};

export type AdaptAmountInput = {
  ttlAmount: number | string;
};

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Prisma filter for orders that count in customer insight lifetime totals. */
export function customerLifetimeTotalOrderWhere() {
  return {
    cancelledAt: null,
    financialStatus: { not: "voided" },
    fulfillmentStage: { in: [...CUSTOMER_LIFETIME_TOTAL_FULFILLMENT_STAGES] },
  };
}

/**
 * Only delivery-complete / invoice-complete Cosmo orders count.
 * Voids, returns, and cancelled rows are excluded.
 */
export function isOrderIncludedInCustomerLifetimeTotal(order: {
  cancelledAt: Date | string | null;
  financialStatus?: string | null;
  fulfillmentStage?: string | null;
}): boolean {
  if (order.cancelledAt) return false;
  if (normalizeStatus(order.financialStatus) === "voided") return false;
  const stage = normalizeStatus(order.fulfillmentStage);
  if (stage === "returned" || stage === "returned_to_store") return false;
  return CUSTOMER_LIFETIME_TOTAL_FULFILLMENT_STAGES.some((s) => s === stage);
}

function toNumber(value: number | string): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Sum Cosmo order totals for completed, non-void, non-return rows. */
export function sumEligibleOrderTotals(orders: OrderAmountInput[]): number {
  let sum = 0;
  for (const order of orders) {
    if (!isOrderIncludedInCustomerLifetimeTotal(order)) continue;
    sum += toNumber(order.totalPrice);
  }
  return sum;
}

/** Sum Adapt historical invoice totals (all linked rows). */
export function sumAdaptTotals(rows: AdaptAmountInput[]): number {
  let sum = 0;
  for (const row of rows) {
    sum += toNumber(row.ttlAmount);
  }
  return sum;
}

export function computeLifetimeTotal(input: {
  orders: OrderAmountInput[];
  adaptRows: AdaptAmountInput[];
}): number {
  return sumEligibleOrderTotals(input.orders) + sumAdaptTotals(input.adaptRows);
}
