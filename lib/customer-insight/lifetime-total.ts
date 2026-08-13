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

export type ContactOrderLookup = { phones: string[]; emails: string[] };

export type AttributableOrderAmount = {
  customerPhone: string | null;
  customerEmail: string | null;
  totalPrice: number | string;
};

/**
 * Attribute eligible Cosmo order totals to contacts.
 * Phone-keyed contacts match `customerPhone` only; email-keyed contacts match email.
 * Same order may count for more than one contact if identifiers overlap.
 */
export function attributeOrderTotalsByContact(input: {
  lookupByContactId: Map<string, ContactOrderLookup>;
  orders: AttributableOrderAmount[];
}): Map<string, number> {
  const phoneIndex = new Map<string, string[]>();
  const emailIndex = new Map<string, string[]>();

  for (const [contactId, keys] of input.lookupByContactId) {
    if (keys.phones.length > 0) {
      for (const phone of keys.phones) {
        if (!phone) continue;
        const list = phoneIndex.get(phone) ?? [];
        list.push(contactId);
        phoneIndex.set(phone, list);
      }
      continue;
    }
    for (const email of keys.emails) {
      const key = email.trim().toLowerCase();
      if (!key) continue;
      const list = emailIndex.get(key) ?? [];
      list.push(contactId);
      emailIndex.set(key, list);
    }
  }

  const totals = new Map<string, number>();
  const add = (contactId: string, amount: number) => {
    totals.set(contactId, (totals.get(contactId) ?? 0) + amount);
  };

  for (const order of input.orders) {
    const amount = toNumber(order.totalPrice);
    const phone = order.customerPhone?.trim() || "";
    if (phone) {
      for (const contactId of phoneIndex.get(phone) ?? []) add(contactId, amount);
    }
    const email = order.customerEmail?.trim().toLowerCase() || "";
    if (email) {
      for (const contactId of emailIndex.get(email) ?? []) add(contactId, amount);
    }
  }

  return totals;
}

export function combineLifetimeTotals(
  contactIds: string[],
  orderTotals: Map<string, number>,
  adaptTotals: Map<string, number>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of contactIds) {
    out.set(id, (orderTotals.get(id) ?? 0) + (adaptTotals.get(id) ?? 0));
  }
  return out;
}
