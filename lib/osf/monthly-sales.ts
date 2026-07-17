import "server-only";

import { prisma } from "@/lib/prisma";

const COLOMBO = "Asia/Colombo";

/** Start/end UTC Date for a YYYY-MM calendar month in Asia/Colombo. */
export function salesMonthBounds(salesMonth: string): { start: Date; end: Date } {
  const [y, m] = salesMonth.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Invalid salesMonth: ${salesMonth}`);
  }
  // Colombo is UTC+5:30 year-round
  const start = new Date(Date.UTC(y, m - 1, 1, -5, -30, 0, 0));
  const endMonth = m === 12 ? 1 : m + 1;
  const endYear = m === 12 ? y + 1 : y;
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1, -5, -30, 0, 0));
  return { start, end };
}

export function monthKeyInColombo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBO,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

/**
 * Aggregate sold units by SKU for a calendar month (Asia/Colombo).
 * Non-voided (cancelledAt null) orders at delivery_complete | invoice_complete.
 * Date = deliveryCompleteAt ?? invoiceCompleteAt. No return netting.
 */
export async function aggregateMonthlySalesBySku(
  companyId: string,
  salesMonth: string,
): Promise<Map<string, number>> {
  const { start, end } = salesMonthBounds(salesMonth);

  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: {
        companyId,
        cancelledAt: null,
        fulfillmentStage: { in: ["delivery_complete", "invoice_complete"] },
        OR: [
          {
            deliveryCompleteAt: { gte: start, lt: end },
          },
          {
            AND: [
              { deliveryCompleteAt: null },
              { invoiceCompleteAt: { gte: start, lt: end } },
            ],
          },
        ],
      },
    },
    select: {
      quantity: true,
      productItem: { select: { sku: true } },
      order: {
        select: {
          deliveryCompleteAt: true,
          invoiceCompleteAt: true,
        },
      },
    },
  });

  const map = new Map<string, number>();
  for (const line of lines) {
    const sku = line.productItem.sku?.trim();
    if (!sku) continue;
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at) continue;
    if (monthKeyInColombo(at) !== salesMonth) continue;
    map.set(sku, (map.get(sku) ?? 0) + line.quantity);
  }
  return map;
}

/** Pure helper for tests — bucket a date into YYYY-MM in Colombo. */
export function attributedSalesMonth(
  deliveryCompleteAt: Date | null,
  invoiceCompleteAt: Date | null,
): string | null {
  const at = deliveryCompleteAt ?? invoiceCompleteAt;
  if (!at) return null;
  return monthKeyInColombo(at);
}
