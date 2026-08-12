import { brandFromAdaptLineItem, brandFromVendorName } from "@/lib/customer-insight/brand";
import { invoiceLineDisplayName } from "@/lib/customer-insight/invoices";
import type { HistoryScopeDto } from "@/lib/customer-insight/types";
import { lineMatchesBrand } from "@/lib/page-data/contact-brand-ids";

export type HistoryScopeInput = {
  brand?: string | null;
  item?: string | null;
};

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function lineSpend(quantity: number, price: string | number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = typeof price === "number" ? price : Number.parseFloat(String(price).replace(/,/g, ""));
  if (!Number.isFinite(p)) return 0;
  return q * p;
}

function lineMatchesItemLabel(
  line: {
    productTitle: string | null;
    variantTitle?: string | null;
    sku?: string | null;
  },
  itemNeedle: string
): boolean {
  const n = norm(itemNeedle);
  if (!n) return true;
  const label = norm(
    invoiceLineDisplayName({
      productTitle: line.productTitle,
      variantTitle: line.variantTitle ?? null,
    })
  );
  const title = norm(line.productTitle ?? "");
  const sku = norm(line.sku ?? "");
  if (label && (label === n || label.includes(n) || n.includes(label))) return true;
  if (title && (title === n || title.includes(n) || n.includes(title))) return true;
  if (sku && (sku === n || sku.includes(n) || n.includes(sku))) return true;
  return false;
}

export function lineMatchesHistoryScope(
  line: {
    productTitle: string | null;
    variantTitle?: string | null;
    sku?: string | null;
    brand?: string | null;
  },
  scope: HistoryScopeInput
): boolean {
  const brandNeedle = scope.brand?.trim() || null;
  const itemNeedle = scope.item?.trim() || null;
  if (!brandNeedle && !itemNeedle) return true;
  if (
    brandNeedle &&
    !lineMatchesBrand(brandNeedle, {
      vendorName: line.brand,
      productTitle: line.productTitle,
    })
  ) {
    return false;
  }
  if (itemNeedle && !lineMatchesItemLabel(line, itemNeedle)) return false;
  return true;
}

export function hasHistoryScope(scope: HistoryScopeInput): boolean {
  return Boolean(scope.brand?.trim() || scope.item?.trim());
}

type CosmoLine = {
  id: string;
  quantity: number;
  price: { toString(): string };
  productItem: {
    productTitle: string | null;
    variantTitle: string | null;
    sku: string | null;
    vendor: { name: string } | null;
  };
};

type CosmoOrder = {
  totalPrice: { toString(): string };
  lineItems: CosmoLine[];
};

type AdaptRow = {
  ttlAmount: { toString(): string };
  lineItems: unknown;
};

export function scopeCosmoOrdersForHistory<T extends CosmoOrder>(
  orders: T[],
  scope: HistoryScopeInput
): { orders: T[]; scopedSpend: number } {
  if (!hasHistoryScope(scope)) return { orders, scopedSpend: 0 };

  let scopedSpend = 0;
  const scoped: T[] = [];

  for (const order of orders) {
    const filtered = order.lineItems.filter((li) =>
      lineMatchesHistoryScope(
        {
          productTitle: li.productItem.productTitle,
          variantTitle: li.productItem.variantTitle,
          sku: li.productItem.sku,
          brand: brandFromVendorName(li.productItem.vendor?.name),
        },
        scope
      )
    );
    if (filtered.length === 0) continue;
    const amount = filtered.reduce(
      (sum, li) => sum + lineSpend(li.quantity, li.price.toString()),
      0
    );
    scopedSpend += amount;
    scoped.push({
      ...order,
      lineItems: filtered as T["lineItems"],
      totalPrice: {
        toString: () => String(amount),
      } as T["totalPrice"],
    });
  }

  return { orders: scoped, scopedSpend };
}

export function scopeAdaptRowsForHistory<T extends AdaptRow>(
  adaptRows: T[],
  scope: HistoryScopeInput
): { adaptRows: T[]; scopedSpend: number } {
  if (!hasHistoryScope(scope)) return { adaptRows, scopedSpend: 0 };

  let scopedSpend = 0;
  const scoped: T[] = [];

  for (const row of adaptRows) {
    const rawItems = Array.isArray(row.lineItems) ? row.lineItems : [];
    const kept: unknown[] = [];
    let amount = 0;
    for (const raw of rawItems) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const productTitle = String(
        obj.itemName ?? obj.productTitle ?? obj.name ?? ""
      ).trim();
      const variantTitle = String(obj.variantTitle ?? obj.variant ?? "").trim();
      const sku = String(obj.itemCode ?? obj.sku ?? "").trim();
      if (
        !lineMatchesHistoryScope(
          {
            productTitle: productTitle || null,
            variantTitle: variantTitle || null,
            sku: sku || null,
            brand: brandFromAdaptLineItem(raw),
          },
          scope
        )
      ) {
        continue;
      }
      kept.push(raw);
      amount += lineSpend(
        Number(obj.quantity ?? 0),
        String(obj.unitPrice ?? obj.price ?? "0")
      );
    }
    if (kept.length === 0) continue;
    scopedSpend += amount;
    scoped.push({
      ...row,
      lineItems: kept,
      ttlAmount: {
        toString: () => String(amount),
      } as T["ttlAmount"],
    });
  }

  return { adaptRows: scoped, scopedSpend };
}

export function buildHistoryScopeDto(
  scope: HistoryScopeInput,
  scopedSpend: number
): HistoryScopeDto | null {
  if (!hasHistoryScope(scope)) return null;
  return {
    brand: scope.brand?.trim() || null,
    item: scope.item?.trim() || null,
    scopedSpend: Math.round(scopedSpend * 100) / 100,
  };
}
