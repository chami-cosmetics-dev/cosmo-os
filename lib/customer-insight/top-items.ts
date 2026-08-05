import { adaptLineItemsForPurchaseUi } from "@/lib/adapt-import/line-items";
import {
  CUSTOMER_INSIGHT_TOP_ITEMS,
  type TopItemDto,
} from "@/lib/customer-insight/types";

export type OrderLineForTopItems = {
  cancelledAt: Date | null;
  lineItems: Array<{
    quantity: number;
    price: number | string;
    productTitle: string | null;
    variantTitle: string | null;
  }>;
};

export type AdaptRowForTopItems = {
  lineItems: unknown;
};

function toNumber(value: number | string): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function itemLabel(productTitle: string | null, variantTitle: string | null): string {
  const title = productTitle?.trim() || "Unknown item";
  const variant = variantTitle?.trim();
  if (variant && variant.toLowerCase() !== "default title") {
    return `${title} — ${variant}`;
  }
  return title;
}

/** Aggregate top items from non-cancelled Cosmo lines + Adapt JSON lines. */
export function aggregateTopItems(input: {
  orders: OrderLineForTopItems[];
  adaptRows: AdaptRowForTopItems[];
  topN?: number;
}): TopItemDto[] {
  const map = new Map<string, { quantity: number; spend: number }>();

  for (const order of input.orders) {
    if (order.cancelledAt) continue;
    for (const line of order.lineItems) {
      const name = itemLabel(line.productTitle, line.variantTitle);
      const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
      const spend = toNumber(line.price) * qty;
      const prev = map.get(name) ?? { quantity: 0, spend: 0 };
      prev.quantity += qty;
      prev.spend += spend;
      map.set(name, prev);
    }
  }

  for (const row of input.adaptRows) {
    for (const line of adaptLineItemsForPurchaseUi(row.lineItems)) {
      const name = itemLabel(line.productTitle, line.variantTitle);
      const qty = line.quantity;
      const spend = toNumber(line.price) * qty;
      const prev = map.get(name) ?? { quantity: 0, spend: 0 };
      prev.quantity += qty;
      prev.spend += spend;
      map.set(name, prev);
    }
  }

  const topN = input.topN ?? CUSTOMER_INSIGHT_TOP_ITEMS;
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      quantity: v.quantity,
      spend: Math.round(v.spend * 100) / 100,
    }))
    .sort((a, b) => b.spend - a.spend || b.quantity - a.quantity)
    .slice(0, topN);
}
