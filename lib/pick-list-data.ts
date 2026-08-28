import { prisma } from "@/lib/prisma";
import { getPickListTodayBounds } from "@/lib/pick-list-date";
import { resolvePickListBarcode } from "@/lib/product-item-barcode";
import { loadBarcodeLookupBySku } from "@/lib/product-item-barcode.server";
import { getLegacyAccSinvFulfillmentWhere } from "@/lib/legacy-acc-sinv";

export type PickListItem = {
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number;
};

export type PickListAggregation = {
  orderCount: number;
  totalItemTypes: number;
  totalUnits: number;
  items: PickListItem[];
};

const orderPickListSelect = {
  lineItems: {
    select: {
      quantity: true,
      productItem: {
        select: {
          id: true,
          productTitle: true,
          variantTitle: true,
          sku: true,
          barcode: true,
        },
      },
    },
  },
} as const;

function pickListItemKey(product: {
  id: string;
  sku: string | null;
  productTitle: string;
  variantTitle: string | null;
}) {
  const sku = product.sku?.trim();
  if (sku) return `sku:${sku}`;
  return `id:${product.id}`;
}

function aggregateOrdersToItems(
  orders: Array<{
    lineItems: Array<{
      quantity: number;
      productItem: {
        id: string;
        productTitle: string;
        variantTitle: string | null;
        sku: string | null;
        barcode: string | null;
      };
    }>;
  }>,
  barcodeBySku: ReadonlyMap<string, string>,
): PickListItem[] {
  const itemMap = new Map<string, PickListItem>();

  for (const order of orders) {
    for (const li of order.lineItems) {
      const p = li.productItem;
      const itemKey = pickListItemKey(p);
      const existing = itemMap.get(itemKey);
      if (existing) {
        existing.quantity += li.quantity;
      } else {
        itemMap.set(itemKey, {
          productTitle: p.productTitle,
          variantTitle: p.variantTitle,
          sku: p.sku,
          barcode: resolvePickListBarcode(p.barcode, p.sku, barcodeBySku),
          quantity: li.quantity,
        });
      }
    }
  }

  return [...itemMap.values()].sort((a, b) => a.productTitle.localeCompare(b.productTitle));
}

function toAggregation(orderCount: number, items: PickListItem[]): PickListAggregation {
  return {
    orderCount,
    totalItemTypes: items.length,
    totalUnits: items.reduce((s, i) => s + i.quantity, 0),
    items,
  };
}

export async function buildPickListAggregationForOrders(
  companyId: string,
  orderIds: string[],
): Promise<PickListAggregation> {
  if (orderIds.length === 0) {
    return { orderCount: 0, totalItemTypes: 0, totalUnits: 0, items: [] };
  }

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      id: { in: orderIds },
      financialStatus: { not: "voided" },
      AND: [getLegacyAccSinvFulfillmentWhere()],
    },
    select: orderPickListSelect,
    orderBy: { lastPrintedAt: "asc" },
  });

  const skus = orders.flatMap((o) =>
    o.lineItems.map((li) => li.productItem.sku).filter((s): s is string => Boolean(s?.trim())),
  );
  const barcodeBySku = await loadBarcodeLookupBySku(companyId, skus);
  const items = aggregateOrdersToItems(orders, barcodeBySku as ReadonlyMap<string, string>);

  return toAggregation(orders.length, items);
}

export async function fetchSinglePrintPickList(companyId: string, date?: string): Promise<PickListAggregation> {
  const { from, to } = getPickListTodayBounds(date);

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      printCount: { gt: 0 },
      lastPrintedAt: { gte: from, lte: to },
      financialStatus: { not: "voided" },
      pickListGroupOrders: { none: {} },
      AND: [getLegacyAccSinvFulfillmentWhere()],
    },
    select: orderPickListSelect,
    orderBy: { lastPrintedAt: "asc" },
  });

  const skus = orders.flatMap((o) =>
    o.lineItems.map((li) => li.productItem.sku).filter((s): s is string => Boolean(s?.trim())),
  );
  const barcodeBySku = await loadBarcodeLookupBySku(companyId, skus);
  const items = aggregateOrdersToItems(orders, barcodeBySku as ReadonlyMap<string, string>);

  return toAggregation(orders.length, items);
}

export async function fetchTodayUngroupedPrintOrderIds(companyId: string, date?: string): Promise<string[]> {
  const { from, to } = getPickListTodayBounds(date);
  const rows = await prisma.order.findMany({
    where: {
      companyId,
      printCount: { gt: 0 },
      lastPrintedAt: { gte: from, lte: to },
      financialStatus: { not: "voided" },
      pickListGroupOrders: { none: {} },
      AND: [getLegacyAccSinvFulfillmentWhere()],
    },
    select: { id: true },
    orderBy: { lastPrintedAt: "asc" },
  });
  return rows.map((row) => row.id);
}
