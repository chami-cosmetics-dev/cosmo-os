/**
 * Lifetime placed-order total for loyalty.
 * Pure reducers are unit-tested; loaders live alongside for API use.
 */

export type OrderAmountInput = {
  totalPrice: number | string;
  cancelledAt: Date | string | null;
};

export type AdaptAmountInput = {
  ttlAmount: number | string;
};

function toNumber(value: number | string): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Sum Cosmo order totals excluding cancelled rows. */
export function sumEligibleOrderTotals(orders: OrderAmountInput[]): number {
  let sum = 0;
  for (const order of orders) {
    if (order.cancelledAt) continue;
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
