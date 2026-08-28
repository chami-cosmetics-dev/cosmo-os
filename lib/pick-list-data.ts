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

export type PickListBrandGroup = {
  brandId: string;
  brandName: string;
  items: PickListItem[];
  totalUnits: number;
};

export type PickListAggregation = {
  orderCount: number;
  totalBrands: number;
  totalUnits: number;
  brandGroups: PickListBrandGroup[];
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
          vendor: { select: { id: true, name: true } },
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

function aggregateOrdersToBrandGroups(
  orders: Array<{
    lineItems: Array<{
      quantity: number;
      productItem: {
        id: string;
        productTitle: string;
        variantTitle: string | null;
        sku: string | null;
        barcode: string | null;
        vendor: { id: string; name: string } | null;
      };
    }>;
  }>,
  barcodeBySku: ReadonlyMap<string, string>,
  vendorBySku: ReadonlyMap<string, { id: string; name: string }>,
): PickListBrandGroup[] {
  const brandMap = new Map<string, { name: string; items: Map<string, PickListItem> }>();

  for (const order of orders) {
    for (const li of order.lineItems) {
      const p = li.productItem;
      const sku = p.sku?.trim() ?? "";
      const vendor = p.vendor ?? (sku ? vendorBySku.get(sku) : undefined);
      const brandId = vendor?.id ?? "no-brand";
      const brandName = vendor?.name?.trim() || "No Brand";

      if (!brandMap.has(brandId)) {
        brandMap.set(brandId, { name: brandName, items: new Map() });
      }
      const brand = brandMap.get(brandId)!;
      const itemKey = pickListItemKey(p);
      const existing = brand.items.get(itemKey);
      if (existing) {
        existing.quantity += li.quantity;
      } else {
        brand.items.set(itemKey, {
          productTitle: p.productTitle,
          variantTitle: p.variantTitle,
          sku: p.sku,
          barcode: resolvePickListBarcode(p.barcode, p.sku, barcodeBySku),
          quantity: li.quantity,
        });
      }
    }
  }

  return [...brandMap.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([brandId, brand]) => {
      const items = [...brand.items.values()].sort((a, b) =>
        a.productTitle.localeCompare(b.productTitle),
      );
      return {
        brandId,
        brandName: brand.name,
        items,
        totalUnits: items.reduce((s, i) => s + i.quantity, 0),
      };
    });
}

async function loadVendorLookupBySku(companyId: string, skus: string[]) {
  const unique = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map<string, { id: string; name: string }>();

  const rows = await prisma.productItem.findMany({
    where: {
      companyId,
      sku: { in: unique },
      vendorId: { not: null },
    },
    select: {
      sku: true,
      vendor: { select: { id: true, name: true } },
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const map = new Map<string, { id: string; name: string }>();
  for (const row of rows) {
    const key = row.sku?.trim();
    if (!key || !row.vendor || map.has(key)) continue;
    map.set(key, row.vendor);
  }
  return map;
}

export async function buildPickListAggregationForOrders(
  companyId: string,
  orderIds: string[],
): Promise<PickListAggregation> {
  if (orderIds.length === 0) {
    return { orderCount: 0, totalBrands: 0, totalUnits: 0, brandGroups: [] };
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
  const vendorBySku = await loadVendorLookupBySku(companyId, skus);
  const brandGroups = aggregateOrdersToBrandGroups(
    orders,
    barcodeBySku as ReadonlyMap<string, string>,
    vendorBySku,
  );

  return {
    orderCount: orders.length,
    totalBrands: brandGroups.length,
    totalUnits: brandGroups.reduce((s, g) => s + g.totalUnits, 0),
    brandGroups,
  };
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
  const vendorBySku = await loadVendorLookupBySku(companyId, skus);
  const brandGroups = aggregateOrdersToBrandGroups(
    orders,
    barcodeBySku as ReadonlyMap<string, string>,
    vendorBySku,
  );

  return {
    orderCount: orders.length,
    totalBrands: brandGroups.length,
    totalUnits: brandGroups.reduce((s, g) => s + g.totalUnits, 0),
    brandGroups,
  };
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

export function toPdfBrands(brandGroups: PickListBrandGroup[]) {
  return brandGroups.map((g) => ({
    brandName: g.brandName,
    items: g.items,
  }));
}
