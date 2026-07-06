import { prisma } from "@/lib/prisma";
import { getPickListTodayBounds } from "@/lib/pick-list-date";
import { resolvePickListBarcode } from "@/lib/product-item-barcode";
import { loadBarcodeLookupBySku } from "@/lib/product-item-barcode.server";

export type PickListItem = {
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number;
};

export type PickListLocationGroup = {
  locationId: string;
  locationName: string;
  items: PickListItem[];
  totalUnits: number;
};

export type PickListAggregation = {
  orderCount: number;
  totalLocations: number;
  totalUnits: number;
  locationGroups: PickListLocationGroup[];
};

const orderPickListSelect = {
  companyLocation: { select: { id: true, name: true } },
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

function aggregateOrdersToLocationGroups(
  orders: Array<{
    companyLocation: { id: string; name: string } | null;
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
): PickListLocationGroup[] {
  const locationMap = new Map<string, { name: string; items: Map<string, PickListItem> }>();

  for (const order of orders) {
    const locationId = order.companyLocation?.id ?? "no-location";
    const locationName = order.companyLocation?.name ?? "No Location";

    if (!locationMap.has(locationId)) {
      locationMap.set(locationId, { name: locationName, items: new Map() });
    }
    const loc = locationMap.get(locationId)!;

    for (const li of order.lineItems) {
      const p = li.productItem;
      const existing = loc.items.get(p.id);
      if (existing) {
        existing.quantity += li.quantity;
      } else {
        loc.items.set(p.id, {
          productTitle: p.productTitle,
          variantTitle: p.variantTitle,
          sku: p.sku,
          barcode: resolvePickListBarcode(p.barcode, p.sku, barcodeBySku),
          quantity: li.quantity,
        });
      }
    }
  }

  return [...locationMap.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([locationId, loc]) => {
      const items = [...loc.items.values()].sort((a, b) =>
        a.productTitle.localeCompare(b.productTitle),
      );
      return {
        locationId,
        locationName: loc.name,
        items,
        totalUnits: items.reduce((s, i) => s + i.quantity, 0),
      };
    });
}

export async function buildPickListAggregationForOrders(
  companyId: string,
  orderIds: string[],
): Promise<PickListAggregation> {
  if (orderIds.length === 0) {
    return { orderCount: 0, totalLocations: 0, totalUnits: 0, locationGroups: [] };
  }

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      id: { in: orderIds },
      financialStatus: { not: "voided" },
    },
    select: orderPickListSelect,
    orderBy: [{ companyLocation: { name: "asc" } }, { lastPrintedAt: "asc" }],
  });

  const skus = orders.flatMap((o) =>
    o.lineItems.map((li) => li.productItem.sku).filter((s): s is string => Boolean(s?.trim())),
  );
  const barcodeBySku = await loadBarcodeLookupBySku(companyId, skus);
  const locationGroups = aggregateOrdersToLocationGroups(
    orders,
    barcodeBySku as ReadonlyMap<string, string>,
  );

  return {
    orderCount: orders.length,
    totalLocations: locationGroups.length,
    totalUnits: locationGroups.reduce((s, g) => s + g.totalUnits, 0),
    locationGroups,
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
    },
    select: orderPickListSelect,
    orderBy: [{ companyLocation: { name: "asc" } }, { lastPrintedAt: "asc" }],
  });

  const skus = orders.flatMap((o) =>
    o.lineItems.map((li) => li.productItem.sku).filter((s): s is string => Boolean(s?.trim())),
  );
  const barcodeBySku = await loadBarcodeLookupBySku(companyId, skus);
  const locationGroups = aggregateOrdersToLocationGroups(
    orders,
    barcodeBySku as ReadonlyMap<string, string>,
  );

  return {
    orderCount: orders.length,
    totalLocations: locationGroups.length,
    totalUnits: locationGroups.reduce((s, g) => s + g.totalUnits, 0),
    locationGroups,
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
    },
    select: { id: true },
    orderBy: { lastPrintedAt: "asc" },
  });
  return rows.map((row) => row.id);
}

export function toPdfLocations(locationGroups: PickListLocationGroup[]) {
  return locationGroups.map((g) => ({
    locationName: g.locationName,
    items: g.items,
  }));
}
