import type { Prisma } from "@prisma/client";

import type {
  AbandonmentReason,
  CustomerResponse,
  FollowUpStatus,
} from "@/lib/abandoned-orders-constants";
import { ABANDONMENT_REASONS, FOLLOW_UP_STATUSES } from "@/lib/abandoned-orders-constants";
import { backfillAbandonedCheckoutDedupe } from "@/lib/abandoned-checkout-dedupe";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import type {
  AbandonedOrdersFilters,
  AbandonedOrdersListItem,
  AbandonedOrdersPagination,
  AbandonedOrdersSameDaySibling,
} from "@/lib/page-data/abandoned-orders-types";

function parseFollowUpStatus(value: string): FollowUpStatus {
  return (FOLLOW_UP_STATUSES as readonly string[]).includes(value)
    ? (value as FollowUpStatus)
    : "pending";
}

function parseCustomerResponse(value: string | null): CustomerResponse | null {
  if (!value) return null;
  return value as CustomerResponse;
}

function parseAbandonmentReason(value: string | null): AbandonmentReason | null {
  if (!value) return null;
  return (ABANDONMENT_REASONS as readonly string[]).includes(value)
    ? (value as AbandonmentReason)
    : null;
}

function toEndOfDayUtc(d: Date) {
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function intentKey(row: {
  exactDuplicateGroupId: string | null;
  cartFingerprint: string | null;
  id: string;
}): string {
  if (row.exactDuplicateGroupId) return `g:${row.exactDuplicateGroupId}`;
  if (row.cartFingerprint) return `f:${row.cartFingerprint}`;
  return `id:${row.id}`;
}

function buildWhere({
  companyId,
  filters,
}: {
  companyId: string;
  filters: AbandonedOrdersFilters;
}): Prisma.ShopifyAbandonedCheckoutWhereInput {
  const search = filters.search?.trim();

  const where: Prisma.ShopifyAbandonedCheckoutWhereInput = {
    companyId,
    supersededByCheckoutId: null,
  };

  if (filters.followUpStatus?.length) {
    where.followUpStatus = { in: [...filters.followUpStatus] };
  }

  if (filters.from || filters.to) {
    where.abandonedAt = {};
    if (filters.from) where.abandonedAt.gte = filters.from;
    if (filters.to) where.abandonedAt.lte = toEndOfDayUtc(filters.to);
  }

  if (filters.customerResponse?.length) {
    where.customerResponse = { in: [...filters.customerResponse] };
  }

  if (search) {
    where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { customerPhone: { contains: search, mode: "insensitive" } },
      { customerEmail: { contains: search, mode: "insensitive" } },
      { billingAddressText: { contains: search, mode: "insensitive" } },
      { shippingAddressText: { contains: search, mode: "insensitive" } },
      { lineItemsSummary: { contains: search, mode: "insensitive" } },
      { shopifyCheckoutId: { contains: search, mode: "insensitive" } },
      { shopifyAdminStoreHandle: { contains: search, mode: "insensitive" } },
    ];
  }

  return where;
}

function attachSameDayAndDupMeta(
  rows: Array<{
    id: string;
    abandonedAt: Date;
    phoneNormalized: string | null;
    cartFingerprint: string | null;
    exactDuplicateGroupId: string | null;
    lineItemsSummary: string;
  }>
): Map<
  string,
  {
    exactDuplicateCount: number;
    sameDaySiblingCount: number;
    sameDaySiblings: AbandonedOrdersSameDaySibling[];
  }
> {
  const groupCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.exactDuplicateGroupId) continue;
    groupCounts.set(
      row.exactDuplicateGroupId,
      (groupCounts.get(row.exactDuplicateGroupId) ?? 0) + 1
    );
  }

  type DayBucket = {
    row: (typeof rows)[number];
    day: string;
    intent: string;
  };

  const byPhoneDay = new Map<string, DayBucket[]>();
  for (const row of rows) {
    if (!row.phoneNormalized) continue;
    const day = formatAppIsoDate(row.abandonedAt);
    if (!day) continue;
    const key = `${row.phoneNormalized}|${day}`;
    const list = byPhoneDay.get(key) ?? [];
    list.push({ row, day, intent: intentKey(row) });
    byPhoneDay.set(key, list);
  }

  const meta = new Map<
    string,
    {
      exactDuplicateCount: number;
      sameDaySiblingCount: number;
      sameDaySiblings: AbandonedOrdersSameDaySibling[];
    }
  >();

  for (const row of rows) {
    meta.set(row.id, {
      exactDuplicateCount: row.exactDuplicateGroupId
        ? groupCounts.get(row.exactDuplicateGroupId) ?? 1
        : 1,
      sameDaySiblingCount: 0,
      sameDaySiblings: [],
    });
  }

  for (const buckets of byPhoneDay.values()) {
    if (buckets.length < 2) continue;
    const sorted = [...buckets].sort(
      (a, b) => b.row.abandonedAt.getTime() - a.row.abandonedAt.getTime()
    );
    const newest = sorted[0]!;
    const newestIntent = newest.intent;
    const siblingIntents = new Map<string, DayBucket>();
    for (const b of sorted.slice(1)) {
      if (b.intent === newestIntent) continue;
      if (!siblingIntents.has(b.intent)) siblingIntents.set(b.intent, b);
    }
    const siblings = [...siblingIntents.values()].map((b) => ({
      id: b.row.id,
      abandonedAt: b.row.abandonedAt.toISOString(),
      lineItemsSummary: b.row.lineItemsSummary,
    }));
    const current = meta.get(newest.row.id);
    if (current) {
      current.sameDaySiblingCount = siblings.length;
      current.sameDaySiblings = siblings;
    }
  }

  return meta;
}

export async function fetchAbandonedOrdersPageData({
  companyId,
  filters,
}: {
  companyId: string;
  filters: AbandonedOrdersFilters;
}): Promise<{ items: AbandonedOrdersListItem[]; pagination: AbandonedOrdersPagination }> {
  const page = filters.page;
  const limit = filters.limit;
  const skip = (page - 1) * limit;

  const needsBackfill = await prisma.shopifyAbandonedCheckout.findFirst({
    where: {
      companyId,
      cartFingerprint: null,
    },
    select: { id: true },
  });
  if (needsBackfill) {
    await backfillAbandonedCheckoutDedupe(companyId);
  }

  const where = buildWhere({ companyId, filters });

  const [rows, total] = await Promise.all([
    prisma.shopifyAbandonedCheckout.findMany({
      where,
      orderBy: { abandonedAt: "desc" },
      skip,
      take: limit,
      include: {
        lastFollowUpBy: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.shopifyAbandonedCheckout.count({ where }),
  ]);

  // Same-day siblings may sit on other pages — load visible cohort for phones on this page.
  const phones = [
    ...new Set(rows.map((r) => r.phoneNormalized).filter((p): p is string => Boolean(p))),
  ];
  const siblingCohort =
    phones.length === 0
      ? []
      : await prisma.shopifyAbandonedCheckout.findMany({
          where: {
            companyId,
            supersededByCheckoutId: null,
            phoneNormalized: { in: phones },
          },
          select: {
            id: true,
            abandonedAt: true,
            phoneNormalized: true,
            cartFingerprint: true,
            exactDuplicateGroupId: true,
            lineItemsSummary: true,
          },
          orderBy: { abandonedAt: "desc" },
        });

  const meta = attachSameDayAndDupMeta(
    siblingCohort.length
      ? siblingCohort
      : rows.map((r) => ({
          id: r.id,
          abandonedAt: r.abandonedAt,
          phoneNormalized: r.phoneNormalized,
          cartFingerprint: r.cartFingerprint,
          exactDuplicateGroupId: r.exactDuplicateGroupId,
          lineItemsSummary: r.lineItemsSummary,
        }))
  );

  // Group counts for exact dupes may include peers not on the current page.
  const groupIds = [
    ...new Set(rows.map((r) => r.exactDuplicateGroupId).filter((id): id is string => Boolean(id))),
  ];
  const groupCountRows =
    groupIds.length === 0
      ? []
      : await prisma.shopifyAbandonedCheckout.groupBy({
          by: ["exactDuplicateGroupId"],
          where: {
            companyId,
            exactDuplicateGroupId: { in: groupIds },
            supersededByCheckoutId: null,
          },
          _count: { _all: true },
        });
  const groupCountMap = new Map(
    groupCountRows.map((g) => [g.exactDuplicateGroupId!, g._count._all])
  );

  const items: AbandonedOrdersListItem[] = rows.map((r) => {
    const rowMeta = meta.get(r.id) ?? {
      exactDuplicateCount: 1,
      sameDaySiblingCount: 0,
      sameDaySiblings: [],
    };
    const exactDuplicateCount = r.exactDuplicateGroupId
      ? groupCountMap.get(r.exactDuplicateGroupId) ?? rowMeta.exactDuplicateCount
      : 1;

    return {
      id: r.id,
      shopifyCheckoutId: r.shopifyCheckoutId,
      abandonedAt: r.abandonedAt.toISOString(),
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      customerEmail: r.customerEmail,
      billingAddressText: r.billingAddressText,
      shippingAddressText: r.shippingAddressText,
      lineItemsSummary: r.lineItemsSummary,
      totalPrice: r.totalPrice.toString(),
      currency: r.currency,
      shopifyAdminStoreHandle: r.shopifyAdminStoreHandle,

      followUpStatus: parseFollowUpStatus(r.followUpStatus),
      customerResponse: parseCustomerResponse(r.customerResponse),
      remark: r.remark ?? null,
      abandonmentReason: parseAbandonmentReason(r.abandonmentReason),

      exactDuplicateGroupId: r.exactDuplicateGroupId,
      exactDuplicateCount,
      sameDaySiblingCount: rowMeta.sameDaySiblingCount,
      sameDaySiblings: rowMeta.sameDaySiblings,

      lastFollowUpBy: r.lastFollowUpBy
        ? {
            id: r.lastFollowUpBy.id,
            name: r.lastFollowUpBy.name,
            email: r.lastFollowUpBy.email ?? null,
          }
        : null,
      lastFollowUpAt: r.lastFollowUpAt ? r.lastFollowUpAt.toISOString() : null,
      shopifyRecoveredAt: r.shopifyRecoveredAt ? r.shopifyRecoveredAt.toISOString() : null,
    };
  });

  return {
    items,
    pagination: {
      page,
      limit,
      total,
    },
  };
}
