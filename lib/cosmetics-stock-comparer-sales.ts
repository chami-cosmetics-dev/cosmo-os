import "server-only";

import { resolveCosmeticsLkChannel } from "@/lib/cosmetics-lk-channel";
import { isCosmeticsLkLocationName } from "@/lib/cosmetics-lk-location";
import { formatAppIsoDate, parseAppCalendarDayStart } from "@/lib/format-datetime";
import { addUtcDays } from "@/lib/osf/assist-window";
import { osfCompletedSalesOrderWhere } from "@/lib/osf/assist-sales";
import { prisma } from "@/lib/prisma";

export const COSMETICS_SALES_LOOKBACK_DAYS = 90;

export type CosmeticsSalesWindow = {
  from: string;
  to: string;
  timezone: "Asia/Colombo";
  days: 90;
};

export type CosmeticsWebsiteSalesResult = {
  window: CosmeticsSalesWindow;
  unitsBySku: Map<string, number>;
};

function salesWindow(now = new Date()): {
  window: CosmeticsSalesWindow;
  rangeStart: Date;
  rangeEndExclusive: Date;
} {
  const to = formatAppIsoDate(now);
  const from = addUtcDays(to, -COSMETICS_SALES_LOOKBACK_DAYS);
  const rangeStart = parseAppCalendarDayStart(from);
  const rangeEndExclusive = parseAppCalendarDayStart(addUtcDays(to, 1));
  if (!rangeStart || !rangeEndExclusive) {
    throw new Error("Could not resolve Cosmetics 90-day sales window");
  }
  return {
    window: { from, to, timezone: "Asia/Colombo", days: 90 },
    rangeStart,
    rangeEndExclusive,
  };
}

export async function loadWebsiteSalesLast90d(
  companyId: string,
  now = new Date(),
): Promise<CosmeticsWebsiteSalesResult> {
  const { window, rangeStart, rangeEndExclusive } = salesWindow(now);

  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    select: { id: true, name: true, shortName: true },
  });
  const cosmeticsLocationIds = locations
    .filter(
      (loc) => isCosmeticsLkLocationName(loc.name) || isCosmeticsLkLocationName(loc.shortName),
    )
    .map((loc) => loc.id);

  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: {
        ...osfCompletedSalesOrderWhere(companyId, rangeStart, rangeEndExclusive),
        ...(cosmeticsLocationIds.length > 0
          ? { companyLocationId: { in: cosmeticsLocationIds } }
          : {}),
        sourceName: { notIn: ["erpnext", "erpnext-pos", "pos", "manual"] },
      },
    },
    select: {
      quantity: true,
      productItem: { select: { sku: true } },
      order: {
        select: {
          sourceName: true,
          deliveryCompleteAt: true,
          invoiceCompleteAt: true,
        },
      },
    },
  });

  const unitsBySku = new Map<string, number>();
  for (const line of lines) {
    if (resolveCosmeticsLkChannel(line.order.sourceName) !== "website") continue;
    const sku = line.productItem.sku?.trim();
    if (!sku) continue;
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at || at < rangeStart || at >= rangeEndExclusive) continue;
    unitsBySku.set(sku, (unitsBySku.get(sku) ?? 0) + line.quantity);
  }

  return { window, unitsBySku };
}
