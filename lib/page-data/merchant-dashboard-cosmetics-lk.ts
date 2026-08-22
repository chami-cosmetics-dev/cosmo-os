import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import {
  classifyMerchantSalesBucket,
  parseOrderCouponList,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";
import { isCosmeticsLkLocationName } from "@/lib/cosmetics-lk-location";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";
import { prisma } from "@/lib/prisma";

export type CosmeticsLkBreakdownBucket = {
  key: string;
  label: string;
  total: number;
  orderCount: number;
};

export type MerchantCosmeticsLkBreakdown = {
  locationId: string;
  locationName: string;
  period: { fromYmd: string; toYmd: string };
  selfTotal: number;
  selfOrderCount: number;
  bySource: CosmeticsLkBreakdownBucket[];
  byGateway: CosmeticsLkBreakdownBucket[];
  /** Line-item spend on VAT-tagged products vs other items (this merchant’s cosmetics.lk orders). */
  byVatItem: CosmeticsLkBreakdownBucket[];
};

export type MerchantCosmeticsLkBreakdownBundle = {
  today: MerchantCosmeticsLkBreakdown | null;
  mtd: MerchantCosmeticsLkBreakdown | null;
};

/** Catalog classification that marks a line item as a VAT item on Cosmetics.lk. */
export const COSMETICS_LK_VAT_CATEGORY = "VAT_TOP_PRIORITY_BRAND";
const VAT_CATEGORY = COSMETICS_LK_VAT_CATEGORY;

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function bump(
  map: Map<string, CosmeticsLkBreakdownBucket>,
  key: string,
  label: string,
  amount: number,
  orders = 1,
) {
  const existing = map.get(key);
  if (existing) {
    existing.total += amount;
    existing.orderCount += orders;
  } else {
    map.set(key, { key, label, total: amount, orderCount: orders });
  }
}

function sortBuckets(
  map: Map<string, CosmeticsLkBreakdownBucket>,
): CosmeticsLkBreakdownBucket[] {
  return [...map.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.label.localeCompare(b.label);
  });
}

function orderTrackingCoupons(order: {
  sourceName: string | null;
  discountCodes: unknown;
  rawPayload: unknown;
}): string[] {
  const merchantCouponCode = getMerchantCouponCode({
    sourceName: order.sourceName,
    discountCodes: order.discountCodes,
    rawPayload: order.rawPayload,
    assignedMerchantCouponCodes: null,
    joinAllDiscountCodes: true,
  });
  return parseOrderCouponList(merchantCouponCode);
}

export { isCosmeticsLkLocationName };

/**
 * Viewed merchant’s attributed cosmetics.lk orders only — split by
 * source (how placed), payment gateway, and VAT-tagged line items.
 */
export async function fetchMerchantCosmeticsLkBreakdown(
  companyId: string,
  merchantUserId: string,
  params: {
    fromYmd: string;
    toYmd: string;
    dateType?: DashboardSalesDateType;
  },
): Promise<MerchantCosmeticsLkBreakdown | null> {
  const dateType: DashboardSalesDateType = params.dateType ?? "all_orders";
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) return null;

  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    select: { id: true, name: true, shortName: true },
  });
  const cosmeticsLoc = locations.find(
    (loc) =>
      isCosmeticsLkLocationName(loc.name) ||
      isCosmeticsLkLocationName(loc.shortName),
  );
  if (!cosmeticsLoc) return null;

  const merchant = await prisma.user.findFirst({
    where: { id: merchantUserId, companyId },
    select: { id: true, couponCodes: true },
  });
  if (!merchant) return null;

  const sets = splitMerchantCouponSets(merchant.couponCodes);
  const dateFilter = buildDashboardSalesDateFilter({
    fromDate,
    toDate,
    dateType,
  });

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      companyLocationId: cosmeticsLoc.id,
      ...dateFilter,
    },
    select: {
      id: true,
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
      paymentGatewayPrimary: true,
      lineItems: {
        select: {
          quantity: true,
          price: true,
          productItem: {
            select: { itemStatusCategory: true },
          },
        },
      },
    },
  });

  const bySource = new Map<string, CosmeticsLkBreakdownBucket>();
  const byGateway = new Map<string, CosmeticsLkBreakdownBucket>();
  const byVatItem = new Map<string, CosmeticsLkBreakdownBucket>();
  let selfTotal = 0;
  let selfOrderCount = 0;

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, dateType)) continue;

    const bucket = classifyMerchantSalesBucket({
      orderCoupons: orderTrackingCoupons(order),
      personal: sets.personal,
      dm: sets.dm,
      hasDm: sets.hasDm,
      assignedToViewer: order.assignedMerchantId === merchantUserId,
    });
    if (!bucket) continue;

    const amount = Number(order.totalPrice ?? 0);
    selfTotal += amount;
    selfOrderCount += 1;

    const sourceLabel = (order.sourceName ?? "").trim() || "Unknown";
    const sourceKey = sourceLabel.toLowerCase();
    bump(bySource, sourceKey, sourceLabel, amount);

    const gatewayLabel =
      getPaymentMethodInfo({
        paymentGatewayPrimary: order.paymentGatewayPrimary,
        financialStatus: order.financialStatus,
      }).label || "Unspecified";
    bump(byGateway, gatewayLabel.toLowerCase(), gatewayLabel, amount);

    let vatSpend = 0;
    let otherSpend = 0;
    let hasVatLine = false;
    for (const line of order.lineItems) {
      const lineTotal = Number(line.price ?? 0) * Number(line.quantity ?? 0);
      if (!Number.isFinite(lineTotal) || lineTotal <= 0) continue;
      if (line.productItem?.itemStatusCategory === VAT_CATEGORY) {
        vatSpend += lineTotal;
        hasVatLine = true;
      } else {
        otherSpend += lineTotal;
      }
    }
    if (vatSpend > 0) {
      bump(byVatItem, "vat", "VAT items", vatSpend, hasVatLine ? 1 : 0);
    }
    if (otherSpend > 0) {
      bump(byVatItem, "other", "Other items", otherSpend, 1);
    }
  }

  return {
    locationId: cosmeticsLoc.id,
    locationName: cosmeticsLoc.name,
    period: { fromYmd: params.fromYmd, toYmd: params.toYmd },
    selfTotal,
    selfOrderCount,
    bySource: sortBuckets(bySource),
    byGateway: sortBuckets(byGateway),
    byVatItem: sortBuckets(byVatItem),
  };
}
