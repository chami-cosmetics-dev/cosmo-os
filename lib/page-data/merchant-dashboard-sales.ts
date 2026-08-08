import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";
import { prisma } from "@/lib/prisma";

export type MerchantSalesLocationRow = {
  locationId: string;
  locationName: string;
  total: number;
  orderCount: number;
};

export type MerchantDashboardSales = {
  total: number;
  orderCount: number;
  byLocation: MerchantSalesLocationRow[];
};

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

/**
 * MTD (or range) sales for one merchant user.
 * Attribution: coupon match to this user, else assignedMerchantId === userId.
 * Does not collapse merchant groups so individual targets stay personal.
 */
export async function fetchMerchantUserSales(
  companyId: string,
  merchantUserId: string,
  params: {
    fromYmd: string;
    toYmd: string;
    dateType?: DashboardSalesDateType;
  },
): Promise<MerchantDashboardSales> {
  const dateType: DashboardSalesDateType = params.dateType ?? "all_orders";
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) {
    return { total: 0, orderCount: 0, byLocation: [] };
  }

  const merchant = await prisma.user.findFirst({
    where: { id: merchantUserId, companyId },
    select: { id: true, couponCodes: true },
  });
  if (!merchant) {
    return { total: 0, orderCount: 0, byLocation: [] };
  }

  const couponSet = new Set(
    merchant.couponCodes.map((c) => c.trim().toLowerCase()).filter(Boolean),
  );

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
        assignedMerchant: {
          select: { couponCodes: true },
        },
      },
    }),
  ]);

  const byLocation = new Map<string, MerchantSalesLocationRow>();
  for (const loc of locations) {
    byLocation.set(loc.id, {
      locationId: loc.id,
      locationName: loc.name,
      total: 0,
      orderCount: 0,
    });
  }

  let total = 0;
  let orderCount = 0;

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, dateType)) continue;

    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      joinAllDiscountCodes: true,
    });
    const orderCoupons = (merchantCouponCode ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    let attributed = false;
    for (const code of orderCoupons) {
      if (couponSet.has(code)) {
        attributed = true;
        break;
      }
    }
    if (!attributed && order.assignedMerchantId === merchantUserId) {
      attributed = true;
    }
    if (!attributed) continue;

    const amount = Number(order.totalPrice ?? 0);
    total += amount;
    orderCount += 1;

    const locRow = byLocation.get(order.companyLocationId);
    if (locRow) {
      locRow.total += amount;
      locRow.orderCount += 1;
    }
  }

  return {
    total,
    orderCount,
    byLocation: [...byLocation.values()]
      .filter((row) => row.orderCount > 0)
      .sort((a, b) => b.total - a.total),
  };
}
