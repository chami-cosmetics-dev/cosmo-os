import { Prisma } from "@prisma/client";

import { canonicalizeMerchantDisplayName } from "@/lib/customer-insight/merchant-label-aliases";
import { getMerchantDisplayName } from "@/lib/merchant-groups";
import { prisma } from "@/lib/prisma";

export type CallCenterAggRow = {
  merchantId: string | null;
  orphanName: string;
  category: string | null;
  count: number;
};

export type CallCenterPerformanceRow = {
  merchantName: string;
  category: string;
  count: number;
};

/** Same day bounds as GM call counts (Asia/Colombo). */
export function parseCallCenterDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

export function parseCallCenterDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

/**
 * Chart / GM label for a call row: credit the user id (GM rule), not the
 * denormalized name. Orphan rows (no merchantId) keep stored name.
 */
export function labelCallCenterPerformanceMerchant(input: {
  user?: {
    id?: string | null;
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  orphanName?: string | null;
}): string {
  if (input.user) {
    const fromUser = canonicalizeMerchantDisplayName(
      getMerchantDisplayName(input.user),
    );
    if (fromUser) return fromUser;
  }
  return canonicalizeMerchantDisplayName(input.orphanName) || "Unknown";
}

/**
 * GM + chart counter: every ContactAllocationUpdate except bulk `allocation`.
 * Loyalty `Contacted` counts. Grouped by merchantId so name drift cannot split totals.
 */
export async function fetchCallCenterAggRows(input: {
  companyId: string;
  fromYmd?: string | null;
  toYmd?: string | null;
  merchantIds?: string[];
}): Promise<CallCenterAggRow[]> {
  if (input.merchantIds && input.merchantIds.length === 0) return [];

  const fromDate =
    input.fromYmd && /^\d{4}-\d{2}-\d{2}$/.test(input.fromYmd)
      ? parseCallCenterDayStart(input.fromYmd)
      : null;
  const toDate =
    input.toYmd && /^\d{4}-\d{2}-\d{2}$/.test(input.toYmd)
      ? parseCallCenterDayEnd(input.toYmd)
      : null;
  if (fromDate && toDate && fromDate > toDate) return [];

  const merchantFilter = input.merchantIds
    ? Prisma.sql`AND "merchantId" = ANY(${input.merchantIds})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      merchantId: string | null;
      orphanName: string | null;
      category: string | null;
      count: bigint;
    }>
  >(Prisma.sql`
    SELECT
      "merchantId",
      CASE
        WHEN "merchantId" IS NULL THEN COALESCE("merchantName", '')
        ELSE ''
      END AS "orphanName",
      "category",
      COUNT(*)::bigint AS "count"
    FROM "ContactAllocationUpdate"
    WHERE "companyId" = ${input.companyId}
      AND (${fromDate}::timestamptz IS NULL OR "createdAt" >= ${fromDate})
      AND (${toDate}::timestamptz IS NULL OR "createdAt" <= ${toDate})
      ${merchantFilter}
      AND "category" IS DISTINCT FROM 'allocation'
    GROUP BY
      "merchantId",
      CASE
        WHEN "merchantId" IS NULL THEN COALESCE("merchantName", '')
        ELSE ''
      END,
      "category"
    ORDER BY "count" DESC
  `);

  return rows.map((row) => ({
    merchantId: row.merchantId,
    orphanName: row.orphanName ?? "",
    category: row.category,
    count: Number(row.count),
  }));
}

export async function fetchCallCenterPerformanceRows(input: {
  companyId: string;
  fromYmd?: string | null;
  toYmd?: string | null;
  merchantUserId?: string | null;
}): Promise<CallCenterPerformanceRow[]> {
  const rows = await fetchCallCenterAggRows({
    companyId: input.companyId,
    fromYmd: input.fromYmd,
    toYmd: input.toYmd,
    merchantIds: input.merchantUserId ? [input.merchantUserId] : undefined,
  });

  const merchantIds = [
    ...new Set(
      rows
        .map((row) => row.merchantId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const users =
    merchantIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: merchantIds } },
          select: {
            id: true,
            knownName: true,
            name: true,
            email: true,
          },
        });
  const userById = new Map(users.map((user) => [user.id, user]));

  return rows.map((row) => ({
    merchantName: labelCallCenterPerformanceMerchant({
      user: row.merchantId ? (userById.get(row.merchantId) ?? null) : null,
      orphanName: row.orphanName,
    }),
    category: row.category ?? "N/A",
    count: Number(row.count),
  }));
}
