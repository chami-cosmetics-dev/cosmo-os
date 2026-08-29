import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";
import type { LocationShareRow } from "@/lib/merchant-dashboard/motivation-types";
import { prisma } from "@/lib/prisma";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import {
  DM_GENERAL_COHORT_ID,
  DM_GENERAL_DISPLAY_NAME,
  parseOrderCouponList,
  resolveCohortMerchantId,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";
import {
  emptyChannelSales,
  isPosChannelOrder,
} from "@/lib/merchant-dashboard/channel-sales";

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
  /** Shop = POS; online = non-POS (accumulated in cohort order pass). */
  byChannel: {
    shop: { orderCount: number; amount: number };
    online: { orderCount: number; amount: number };
  };
};

export type CohortSalesResult = {
  fromYmd: string;
  toYmd: string;
  byMerchant: Map<string, CohortMerchantTotals>;
  locationNames: Map<string, string>;
  /** Synthetic DM-General id when a cohort merchant holds DM MER codes. */
  dmBucketId: string | null;
};

function emptyMerchantTotals(
  merchantId: string,
  displayName: string,
): CohortMerchantTotals {
  return {
    merchantId,
    displayName,
    total: 0,
    orderCount: 0,
    byLocation: new Map(),
    byChannel: emptyChannelSales(),
  };
}

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
 * Single order pass attributing each eligible order to at most one cohort row
 * (personal MER → merchant; DM MER / no MER → synthetic DM-General when present).
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
    byMerchant.set(m.id, emptyMerchantTotals(m.id, m.displayName));
  }

  const locationNames = new Map<string, string>();
  if (fromDate > toDate || merchants.length === 0) {
    return {
      fromYmd: params.fromYmd,
      toYmd: params.toYmd,
      byMerchant,
      locationNames,
      dmBucketId: null,
    };
  }

  const couponToMerchantId = new Map<string, string>();
  const cohortIds = new Set(merchants.map((m) => m.id));
  let hasDmHolder = false;
  for (const m of merchants) {
    const sets = splitMerchantCouponSets(m.couponCodes);
    if (sets.hasDm) hasDmHolder = true;
    for (const code of m.couponCodes) {
      const key = code.trim().toLowerCase();
      if (!key || couponToMerchantId.has(key)) continue;
      // DM codes → synthetic bucket (location share totals / personal DM split; not peer race).
      couponToMerchantId.set(key, sets.dm.has(key) ? DM_GENERAL_COHORT_ID : m.id);
    }
  }

  const dmBucketId = hasDmHolder ? DM_GENERAL_COHORT_ID : null;
  if (dmBucketId) {
    byMerchant.set(
      dmBucketId,
      emptyMerchantTotals(dmBucketId, DM_GENERAL_DISPLAY_NAME),
    );
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
      dmBucketId,
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

    const channelBucket = isPosChannelOrder(order.sourceName)
      ? row.byChannel.shop
      : row.byChannel.online;
    channelBucket.amount += amount;
    channelBucket.orderCount += 1;
  }

  return {
    fromYmd: params.fromYmd,
    toYmd: params.toYmd,
    byMerchant,
    locationNames,
    dmBucketId,
  };
}

/** Pure: build location share rows for viewed merchant from a cohort scan.
 * All merchants at each location are included (no peer cap). */
export function buildLocationShareRows(
  cohort: CohortSalesResult,
  viewedMerchantId: string,
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
      // Keep DM sales in location total for share %, but never list DM-General as a peer.
      const isDmBucket =
        cohort.dmBucketId != null && merchant.merchantId === cohort.dmBucketId;
      if (merchant.merchantId !== viewedMerchantId && !isDmBucket) {
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
