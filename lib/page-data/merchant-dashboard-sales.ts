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

export type MerchantTopCustomerRow = {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  total: number;
  orderCount: number;
};

function customerGroupKey(order: {
  customerPhone: string | null;
  customerEmail: string | null;
  name: string | null;
}) {
  const phone = (order.customerPhone ?? "").replace(/\D/g, "");
  if (phone.length >= 7) return `p:${phone}`;
  const email = (order.customerEmail ?? "").trim().toLowerCase();
  if (email) return `e:${email}`;
  const name = (order.name ?? "").trim().toLowerCase();
  if (name) return `n:${name}`;
  return null;
}

/**
 * Top customers by attributed Cosmo sales for this merchant (non-cancelled).
 * Uses Order.assignedMerchantId (same link used for returns).
 */
export async function fetchMerchantTopCustomersBySales(
  companyId: string,
  merchantUserId: string,
  params?: { limit?: number },
): Promise<MerchantTopCustomerRow[]> {
  const limit = params?.limit ?? 10;

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      assignedMerchantId: merchantUserId,
      cancelledAt: null,
    },
    select: {
      totalPrice: true,
      name: true,
      customerPhone: true,
      customerEmail: true,
    },
    take: 8_000,
    orderBy: { createdAt: "desc" },
  });

  const byCustomer = new Map<string, MerchantTopCustomerRow>();

  for (const order of orders) {
    const key = customerGroupKey(order);
    if (!key) continue;

    const amount = Number(order.totalPrice ?? 0);
    const existing = byCustomer.get(key);
    if (existing) {
      existing.total += amount;
      existing.orderCount += 1;
      if (!existing.name && order.name) existing.name = order.name.trim();
      if (!existing.phone && order.customerPhone) existing.phone = order.customerPhone;
      if (!existing.email && order.customerEmail) existing.email = order.customerEmail;
    } else {
      byCustomer.set(key, {
        key,
        name: order.name?.trim() || order.customerPhone || order.customerEmail || "Customer",
        phone: order.customerPhone,
        email: order.customerEmail,
        total: amount,
        orderCount: 1,
      });
    }
  }

  return [...byCustomer.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export type MerchantReturnStats = {
  returnOrderCount: number;
  orderCount: number;
  returnRatePct: number | null;
};

/** MTD return % = distinct returned orders / attributed order count for the period. */
export async function fetchMerchantReturnStats(
  companyId: string,
  merchantUserId: string,
  params: { fromYmd: string; toYmd: string; orderCount: number },
): Promise<MerchantReturnStats> {
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) {
    return { returnOrderCount: 0, orderCount: params.orderCount, returnRatePct: null };
  }

  const returns = await prisma.orderReturn.findMany({
    where: {
      companyId,
      merchantUserId,
      returnDate: { gte: fromDate, lte: toDate },
    },
    select: { orderId: true },
  });

  const returnOrderCount = new Set(returns.map((row) => row.orderId)).size;
  const orderCount = params.orderCount;
  const returnRatePct =
    orderCount > 0
      ? Math.round((returnOrderCount / orderCount) * 1000) / 10
      : null;

  return { returnOrderCount, orderCount, returnRatePct };
}
