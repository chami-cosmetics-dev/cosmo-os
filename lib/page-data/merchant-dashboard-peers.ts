import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";
import type { LocationShareRow } from "@/lib/merchant-dashboard/motivation-types";
import { prisma } from "@/lib/prisma";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import {
  parseOrderCouponList,
  resolveCohortMerchantId,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";

export type CohortMerchantInput = {
  id: string;
  displayName: string;
  couponCodes: string[];
};

export type CohortMerchantTotals = {
  merchantId: string;
  displayName: string;
  total: number;
  orderCount: number;
  byLocation: Map<
    string,
    { locationId: string; locationName: string; total: number; orderCount: number }
  >;
};

export type CohortSalesResult = {
  fromYmd: string;
  toYmd: string;
  byMerchant: Map<string, CohortMerchantTotals>;
  locationNames: Map<string, string>;
};

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function sharePct(part: number, whole: number): number | null {
  if (!Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/**
 * Single order pass attributing each eligible order to at most one cohort merchant
 * (coupon match first, else assignedMerchantId if in cohort).
 */
export async function fetchMerchantCohortSales(
  companyId: string,
  merchants: CohortMerchantInput[],
  params: {
    fromYmd: string;
    toYmd: string;
    dateType?: DashboardSalesDateType;
  },
): Promise<CohortSalesResult> {
  const dateType: DashboardSalesDateType = params.dateType ?? "all_orders";
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);

  const byMerchant = new Map<string, CohortMerchantTotals>();
  for (const m of merchants) {
    byMerchant.set(m.id, {
      merchantId: m.id,
      displayName: m.displayName,
      total: 0,
      orderCount: 0,
      byLocation: new Map(),
    });
  }

  const locationNames = new Map<string, string>();
  if (fromDate > toDate || merchants.length === 0) {
    return { fromYmd: params.fromYmd, toYmd: params.toYmd, byMerchant, locationNames };
  }

  const couponToMerchantId = new Map<string, string>();
  const cohortIds = new Set(merchants.map((m) => m.id));
  let dmMerchantId: string | null = null;
  for (const m of merchants) {
    const sets = splitMerchantCouponSets(m.couponCodes);
    if (sets.hasDm && !dmMerchantId) dmMerchantId = m.id;
    for (const code of m.couponCodes) {
      const key = code.trim().toLowerCase();
      if (key && !couponToMerchantId.has(key)) {
        couponToMerchantId.set(key, m.id);
      }
    }
  }

  const dateFilter = buildDashboardSalesDateFilter({
    fromDate,
    toDate,
    dateType,
  });

  const [locations, orders] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.order.findMany({
      where: {
        companyId,
        ...dateFilter,
      },
      select: {
        companyLocationId: true,
        assignedMerchantId: true,
        totalPrice: true,
        sourceName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        deliveryCompleteAt: true,
        invoiceCompleteAt: true,
        discountCodes: true,
        rawPayload: true,
      },
    }),
  ]);

  for (const loc of locations) {
    locationNames.set(loc.id, loc.name);
  }

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, dateType)) continue;

    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: null,
      joinAllDiscountCodes: true,
    });
    const orderCoupons = parseOrderCouponList(merchantCouponCode);
    const merchantId = resolveCohortMerchantId({
      orderCoupons,
      couponToMerchantId,
      assignedMerchantId: order.assignedMerchantId,
      cohortIds,
      dmMerchantId,
    });
    if (!merchantId) continue;

    const row = byMerchant.get(merchantId);
    if (!row) continue;

    const amount = Number(order.totalPrice ?? 0);
    row.total += amount;
    row.orderCount += 1;

    const locationId = order.companyLocationId || "unassigned";
    const locationName =
      locationNames.get(locationId) ??
      (locationId === "unassigned" ? "Unassigned" : locationId);
    if (!locationNames.has(locationId)) {
      locationNames.set(locationId, locationName);
    }

    const loc = row.byLocation.get(locationId) ?? {
      locationId,
      locationName,
      total: 0,
      orderCount: 0,
    };
    loc.total += amount;
    loc.orderCount += 1;
    row.byLocation.set(locationId, loc);
  }

  return {
    fromYmd: params.fromYmd,
    toYmd: params.toYmd,
    byMerchant,
    locationNames,
  };
}

const LOCATION_PEER_CAP = 8;

/** Pure: build location share rows for viewed merchant from a cohort scan. */
export function buildLocationShareRows(
  cohort: CohortSalesResult,
  viewedMerchantId: string,
  peerCap = LOCATION_PEER_CAP,
): LocationShareRow[] {
  const viewed = cohort.byMerchant.get(viewedMerchantId);
  if (!viewed) return [];

  const locationTotals = new Map<
    string,
    {
      locationName: string;
      total: number;
      peers: Array<{
        merchantId: string;
        displayName: string;
        total: number;
        orderCount: number;
      }>;
    }
  >();

  for (const merchant of cohort.byMerchant.values()) {
    for (const loc of merchant.byLocation.values()) {
      if (loc.total <= 0) continue;
      const bucket =
        locationTotals.get(loc.locationId) ??
        {
          locationName: loc.locationName,
          total: 0,
          peers: [],
        };
      bucket.total += loc.total;
      if (merchant.merchantId !== viewedMerchantId) {
        bucket.peers.push({
          merchantId: merchant.merchantId,
          displayName: merchant.displayName,
          total: loc.total,
          orderCount: loc.orderCount,
        });
      }
      locationTotals.set(loc.locationId, bucket);
    }
  }

  const rows: LocationShareRow[] = [];
  for (const [locationId, bucket] of locationTotals) {
    if (bucket.total <= 0) continue;
    const selfLoc = viewed.byLocation.get(locationId);
    const selfAmount = selfLoc?.total ?? 0;
    const selfOrderCount = selfLoc?.orderCount ?? 0;
    const peers = [...bucket.peers]
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, peerCap)
      .map((p) => ({
        ...p,
        sharePct: sharePct(p.total, bucket.total),
      }));

    rows.push({
      locationId,
      locationName: bucket.locationName,
      locationTotal: bucket.total,
      selfAmount,
      selfOrderCount,
      selfSharePct: sharePct(selfAmount, bucket.total),
      peers,
    });
  }

  return rows.sort((a, b) => {
    if (b.selfAmount !== a.selfAmount) return b.selfAmount - a.selfAmount;
    return b.locationTotal - a.locationTotal;
  });
}
