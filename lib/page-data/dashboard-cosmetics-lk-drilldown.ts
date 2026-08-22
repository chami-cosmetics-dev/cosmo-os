import {
  COSMETICS_LK_CHANNEL_KEYS,
  getCosmeticsLkChannelLabel,
  resolveCosmeticsLkChannel,
  type CosmeticsLkChannel,
} from "@/lib/cosmetics-lk-channel";
import { isCosmeticsLkLocationName } from "@/lib/cosmetics-lk-location";
import {
  buildCouponToMerchantMap,
  getMerchantGroupUserMap,
  matchMerchantFromCouponMap,
  resolveAssignedMerchantDashboardFallback,
} from "@/lib/merchant-groups";
import { normalizeDashboardMerchantLabel } from "@/lib/merchant-dm-sales";
import { getOrderDiscountCouponCode } from "@/lib/order-discount-coupon";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";
import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import { COSMETICS_LK_VAT_CATEGORY } from "@/lib/page-data/merchant-dashboard-cosmetics-lk";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";
import { prisma } from "@/lib/prisma";

export type CosmeticsLkDrilldownBucket = {
  key: string;
  label: string;
  total: number;
  orderCount: number;
};

export type CosmeticsLkDrilldownDiscountCode = {
  code: string;
  orderCount: number;
};

export type CosmeticsLkDrilldownMerchant = {
  merchantId: string | null;
  merchantName: string;
  total: number;
  orderCount: number;
  discountTotal: number;
  byChannel: CosmeticsLkDrilldownBucket[];
  byPaymentType: CosmeticsLkDrilldownBucket[];
  byVatItem: CosmeticsLkDrilldownBucket[];
  discountCodes: CosmeticsLkDrilldownDiscountCode[];
};

export type CosmeticsLkDrilldown = {
  locationId: string;
  locationName: string;
  from: string;
  to: string;
  dateType: DashboardSalesDateType;
  total: number;
  orderCount: number;
  discountTotal: number;
  byChannel: CosmeticsLkDrilldownBucket[];
  byPaymentType: CosmeticsLkDrilldownBucket[];
  byVatItem: CosmeticsLkDrilldownBucket[];
  byDiscountCode: CosmeticsLkDrilldownBucket[];
  merchants: CosmeticsLkDrilldownMerchant[];
};

export type CosmeticsLkDrilldownResult =
  | { ok: true; data: CosmeticsLkDrilldown }
  | { ok: false; reason: "invalid_range" | "location_not_found" };

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function bump(
  map: Map<string, CosmeticsLkDrilldownBucket>,
  key: string,
  label: string,
  amount: number,
  orders = 1,
) {
  const existing = map.get(key);
  if (existing) {
    existing.total += amount;
    existing.orderCount += orders;
    return;
  }
  map.set(key, { key, label, total: amount, orderCount: orders });
}

function sortByTotalDesc(
  buckets: CosmeticsLkDrilldownBucket[],
): CosmeticsLkDrilldownBucket[] {
  return [...buckets].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.label.localeCompare(b.label);
  });
}

/** Fixed channel order; Manual only surfaces once it has orders. */
function channelBuckets(
  map: Map<CosmeticsLkChannel, CosmeticsLkDrilldownBucket>,
): CosmeticsLkDrilldownBucket[] {
  const rows: CosmeticsLkDrilldownBucket[] = [];
  for (const channel of COSMETICS_LK_CHANNEL_KEYS) {
    const bucket = map.get(channel);
    if (channel === "manual" && (!bucket || bucket.orderCount === 0)) continue;
    rows.push(
      bucket ?? {
        key: channel,
        label: getCosmeticsLkChannelLabel(channel),
        total: 0,
        orderCount: 0,
      },
    );
  }
  return rows;
}

type MerchantAccumulator = {
  merchantId: string | null;
  merchantName: string;
  total: number;
  orderCount: number;
  discountTotal: number;
  byChannel: Map<CosmeticsLkChannel, CosmeticsLkDrilldownBucket>;
  byPaymentType: Map<string, CosmeticsLkDrilldownBucket>;
  byVatItem: Map<string, CosmeticsLkDrilldownBucket>;
  discountCodes: Map<string, CosmeticsLkDrilldownDiscountCode>;
};

/**
 * Every merchant's Cosmetics.lk sales for the dashboard card's current filter,
 * split by channel, payment type, VAT line spend, and discounts. Attribution and
 * eligibility mirror `fetchDashboardSalesByLocationMerchant` so merchant totals
 * add up to the card headline.
 */
export async function fetchCosmeticsLkDrilldown(
  companyId: string,
  params: {
    fromYmd: string;
    toYmd: string;
    dateType: DashboardSalesDateType;
  },
): Promise<CosmeticsLkDrilldownResult> {
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) return { ok: false, reason: "invalid_range" };

  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, shortName: true },
  });
  const cosmeticsLoc = locations.find(
    (loc) =>
      isCosmeticsLkLocationName(loc.name) ||
      isCosmeticsLkLocationName(loc.shortName),
  );
  if (!cosmeticsLoc) return { ok: false, reason: "location_not_found" };

  const dateFilter = buildDashboardSalesDateFilter({
    fromDate,
    toDate,
    dateType: params.dateType,
  });

  const [usersWithCoupons, orders, userToGroup] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, couponCodes: { isEmpty: false } },
      select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
    }),
    prisma.order.findMany({
      where: {
        companyId,
        companyLocationId: cosmeticsLoc.id,
        ...dateFilter,
      },
      select: {
        assignedMerchantId: true,
        totalPrice: true,
        totalDiscounts: true,
        sourceName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        deliveryOutcome: true,
        deliveryCompleteAt: true,
        invoiceCompleteAt: true,
        discountCodes: true,
        rawPayload: true,
        paymentGatewayPrimary: true,
        assignedMerchant: {
          select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
        },
        lineItems: {
          select: {
            quantity: true,
            price: true,
            productItem: { select: { itemStatusCategory: true } },
          },
        },
      },
    }),
    getMerchantGroupUserMap(companyId),
  ]);

  const couponToUser = buildCouponToMerchantMap(usersWithCoupons, userToGroup);

  let total = 0;
  let orderCount = 0;
  let discountTotal = 0;
  const byChannel = new Map<CosmeticsLkChannel, CosmeticsLkDrilldownBucket>();
  const byPaymentType = new Map<string, CosmeticsLkDrilldownBucket>();
  const byVatItem = new Map<string, CosmeticsLkDrilldownBucket>();
  const byDiscountCode = new Map<string, CosmeticsLkDrilldownBucket>();
  const merchantMap = new Map<string, MerchantAccumulator>();

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, params.dateType)) continue;

    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      joinAllDiscountCodes: true,
    });
    const merchantCoupons = (merchantCouponCode ?? "")
      .split(",")
      .map((coupon) => coupon.trim().toLowerCase())
      .filter(Boolean);

    const matched = matchMerchantFromCouponMap(merchantCoupons, couponToUser);
    const resolved =
      matched ??
      resolveAssignedMerchantDashboardFallback({
        assignedMerchantId: order.assignedMerchantId,
        assignedMerchant: order.assignedMerchant,
        orderCoupons: merchantCoupons,
        userToGroup,
      });
    const merchantId = resolved.id;
    const merchantName = normalizeDashboardMerchantLabel(resolved.name);
    const merchantKey = merchantId ?? `__${merchantName.toLowerCase()}`;

    let merchant = merchantMap.get(merchantKey);
    if (!merchant) {
      merchant = {
        merchantId,
        merchantName,
        total: 0,
        orderCount: 0,
        discountTotal: 0,
        byChannel: new Map(),
        byPaymentType: new Map(),
        byVatItem: new Map(),
        discountCodes: new Map(),
      };
      merchantMap.set(merchantKey, merchant);
    }

    const amount = Number(order.totalPrice ?? 0);
    total += amount;
    orderCount += 1;
    merchant.total += amount;
    merchant.orderCount += 1;

    const channel = resolveCosmeticsLkChannel(order.sourceName);
    const channelLabel = getCosmeticsLkChannelLabel(channel);
    bump(byChannel, channel, channelLabel, amount);
    bump(merchant.byChannel, channel, channelLabel, amount);

    const paymentLabel =
      getPaymentMethodInfo({
        paymentGatewayPrimary: order.paymentGatewayPrimary,
        financialStatus: order.financialStatus,
      }).label || "Unspecified";
    const paymentKey = paymentLabel.toLowerCase();
    bump(byPaymentType, paymentKey, paymentLabel, amount);
    bump(merchant.byPaymentType, paymentKey, paymentLabel, amount);

    let vatSpend = 0;
    let otherSpend = 0;
    for (const line of order.lineItems) {
      const lineTotal = Number(line.price ?? 0) * Number(line.quantity ?? 0);
      if (!Number.isFinite(lineTotal) || lineTotal <= 0) continue;
      if (line.productItem?.itemStatusCategory === COSMETICS_LK_VAT_CATEGORY) {
        vatSpend += lineTotal;
      } else {
        otherSpend += lineTotal;
      }
    }
    if (vatSpend > 0) {
      bump(byVatItem, "vat", "VAT items", vatSpend);
      bump(merchant.byVatItem, "vat", "VAT items", vatSpend);
    }
    if (otherSpend > 0) {
      bump(byVatItem, "other", "Other items", otherSpend);
      bump(merchant.byVatItem, "other", "Other items", otherSpend);
    }

    const orderDiscount = Number(order.totalDiscounts ?? 0);
    if (Number.isFinite(orderDiscount) && orderDiscount > 0) {
      discountTotal += orderDiscount;
      merchant.discountTotal += orderDiscount;
    }

    // Promotional codes only — MER/DM tracking codes already show as merchant rows.
    const discountCode = getOrderDiscountCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
    });
    if (discountCode) {
      const codeKey = discountCode.trim().toLowerCase();
      bump(byDiscountCode, codeKey, discountCode.trim(), 0);
      const existingCode = merchant.discountCodes.get(codeKey);
      if (existingCode) {
        existingCode.orderCount += 1;
      } else {
        merchant.discountCodes.set(codeKey, {
          code: discountCode.trim(),
          orderCount: 1,
        });
      }
    }
  }

  const merchants: CosmeticsLkDrilldownMerchant[] = [...merchantMap.values()]
    .filter((merchant) => merchant.orderCount > 0)
    .map((merchant) => ({
      merchantId: merchant.merchantId,
      merchantName: merchant.merchantName,
      total: merchant.total,
      orderCount: merchant.orderCount,
      discountTotal: merchant.discountTotal,
      byChannel: channelBuckets(merchant.byChannel),
      byPaymentType: sortByTotalDesc([...merchant.byPaymentType.values()]),
      byVatItem: sortByTotalDesc([...merchant.byVatItem.values()]),
      discountCodes: [...merchant.discountCodes.values()].sort((a, b) => {
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        return a.code.localeCompare(b.code);
      }),
    }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.merchantName.localeCompare(b.merchantName);
    });

  return {
    ok: true,
    data: {
      locationId: cosmeticsLoc.id,
      locationName: cosmeticsLoc.name,
      from: params.fromYmd,
      to: params.toYmd,
      dateType: params.dateType,
      total,
      orderCount,
      discountTotal,
      byChannel: channelBuckets(byChannel),
      byPaymentType: sortByTotalDesc([...byPaymentType.values()]),
      byVatItem: sortByTotalDesc([...byVatItem.values()]),
      byDiscountCode: [...byDiscountCode.values()].sort((a, b) => {
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        return a.label.localeCompare(b.label);
      }),
      merchants,
    },
  };
}
