import {
  buildPhoneLookupVariants,
  canonicalPhoneForErpCustomerId,
} from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

export type PurchaseSummary = {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

export type PhonePurchaseAggregate = {
  customerPhone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

function normalizePhone(value: string | null | undefined) {
  return value?.trim() || "";
}

export function phoneMatchKeys(raw: string | null | undefined): string[] {
  const phone = normalizePhone(raw);
  if (!phone) return [];
  const keys = new Set<string>();
  const canonical = canonicalPhoneForErpCustomerId(phone);
  if (canonical) keys.add(canonical);
  for (const variant of buildPhoneLookupVariants(phone)) {
    keys.add(variant);
    const variantCanonical = canonicalPhoneForErpCustomerId(variant);
    if (variantCanonical) keys.add(variantCanonical);
  }
  return [...keys];
}

function emptySummary(): PurchaseSummary {
  return { orderCount: 0, totalSpent: 0, lastOrderAt: null };
}

function mergeSummary(target: PurchaseSummary, row: PhonePurchaseAggregate) {
  target.orderCount += row.orderCount;
  target.totalSpent += row.totalSpent;
  if (row.lastOrderAt && (!target.lastOrderAt || row.lastOrderAt > target.lastOrderAt)) {
    target.lastOrderAt = row.lastOrderAt;
  }
}

/**
 * Index SQL phone aggregates so 077… / +94… / 94… resolve to one summary object.
 */
export function indexPurchaseAggregatesByPhoneKey(
  rows: PhonePurchaseAggregate[]
): Map<string, PurchaseSummary> {
  const byKey = new Map<string, PurchaseSummary>();

  for (const row of rows) {
    const keys = phoneMatchKeys(row.customerPhone);
    if (keys.length === 0) continue;

    let summary: PurchaseSummary | undefined;
    for (const key of keys) {
      summary = byKey.get(key);
      if (summary) break;
    }
    if (!summary) summary = emptySummary();
    mergeSummary(summary, row);
    for (const key of keys) {
      byKey.set(key, summary);
    }
  }

  return byKey;
}

export function purchaseSummaryForPhone(
  byKey: Map<string, PurchaseSummary>,
  phone: string | null | undefined
): PurchaseSummary | undefined {
  for (const key of phoneMatchKeys(phone)) {
    const summary = byKey.get(key);
    if (summary) return summary;
  }
  return undefined;
}

function toAmount(value: { toString(): string } | number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : 0;
}

/**
 * One GROUP BY query instead of loading every Order row into memory.
 * Needed so Contact Master ~80k export can finish inside maxDuration.
 */
export async function loadOrderPurchaseAggregates(
  companyId: string
): Promise<Map<string, PurchaseSummary>> {
  const grouped = await prisma.order.groupBy({
    by: ["customerPhone"],
    where: {
      companyId,
      customerPhone: { not: null },
    },
    _count: { _all: true },
    _sum: { totalPrice: true },
    _max: { createdAt: true },
  });

  return indexPurchaseAggregatesByPhoneKey(
    grouped.flatMap((row) => {
      const customerPhone = row.customerPhone?.trim() ?? "";
      if (!customerPhone) return [];
      return [
        {
          customerPhone,
          orderCount: row._count._all,
          totalSpent: toAmount(row._sum.totalPrice),
          lastOrderAt: row._max.createdAt,
        },
      ];
    })
  );
}
