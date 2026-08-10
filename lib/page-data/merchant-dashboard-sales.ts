import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";

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
  /** Distinct purchase calendar days (Asia/Colombo) — frequency rank key. */
  purchaseDays: number;
};

function looksLikeInvoiceOrOrderRef(value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v) return false;
  // e.g. 800-000025, 900-000354, SI refs — not a person name
  return /^\d{3,}-\d+$/.test(v) || /^#?\d{4,}$/.test(v);
}

function pickPersonName(order: {
  name: string | null;
  shippingAddress: unknown;
  customer?: { firstName: string | null; lastName: string | null } | null;
}): string | null {
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const s = order.shippingAddress as Record<string, unknown>;
    const raw = s.name ?? [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
    if (typeof raw === "string" && raw.trim() && !looksLikeInvoiceOrOrderRef(raw)) {
      return raw.trim();
    }
  }
  if (order.customer?.firstName || order.customer?.lastName) {
    const joined = [order.customer.firstName, order.customer.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (joined) return joined;
  }
  if (order.name?.trim() && !looksLikeInvoiceOrOrderRef(order.name)) {
    return order.name.trim();
  }
  return null;
}

function customerGroupKey(order: {
  customerPhone: string | null;
  customerEmail: string | null;
  customerId: string | null;
}) {
  const phone = (order.customerPhone ?? "").replace(/\D/g, "");
  if (phone.length >= 7) return `p:${phone}`;
  const email = (order.customerEmail ?? "").trim().toLowerCase();
  if (email.includes("@")) return `e:${email}`;
  if (order.customerId) return `c:${order.customerId}`;
  return null;
}

type MerchantOrderForCustomers = {
  totalPrice: unknown;
  name: string | null;
  customerId: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  createdAt: Date;
  shippingAddress: unknown;
  customer?: { firstName: string | null; lastName: string | null } | null;
};

function aggregateTopCustomers(
  orders: MerchantOrderForCustomers[],
  params: {
    limit: number;
    rankBy: "purchaseDays" | "total";
  },
): MerchantTopCustomerRow[] {
  type Acc = MerchantTopCustomerRow & { daySet: Set<string> };
  const byCustomer = new Map<string, Acc>();

  for (const order of orders) {
    const key = customerGroupKey(order);
    if (!key) continue;

    const amount = Number(order.totalPrice ?? 0);
    const day = formatAppIsoDate(order.createdAt);
    const personName = pickPersonName(order);
    const existing = byCustomer.get(key);
    if (existing) {
      existing.total += amount;
      existing.orderCount += 1;
      if (day) existing.daySet.add(day);
      if (
        personName &&
        (looksLikeInvoiceOrOrderRef(existing.name) || existing.name === "Customer")
      ) {
        existing.name = personName;
      }
      if (!existing.phone && order.customerPhone) existing.phone = order.customerPhone;
      if (!existing.email && order.customerEmail) existing.email = order.customerEmail;
    } else {
      const daySet = new Set<string>();
      if (day) daySet.add(day);
      byCustomer.set(key, {
        key,
        name: personName || order.customerPhone || order.customerEmail || "Customer",
        phone: order.customerPhone,
        email: order.customerEmail,
        total: amount,
        orderCount: 1,
        purchaseDays: 0,
        daySet,
      });
    }
  }

  return [...byCustomer.values()]
    .map((row) => ({
      key: row.key,
      name: row.name,
      phone: row.phone,
      email: row.email,
      total: row.total,
      orderCount: row.orderCount,
      purchaseDays: row.daySet.size,
    }))
    .sort((a, b) => {
      if (params.rankBy === "total") {
        if (b.total !== a.total) return b.total - a.total;
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        return b.purchaseDays - a.purchaseDays;
      }
      if (b.purchaseDays !== a.purchaseDays) return b.purchaseDays - a.purchaseDays;
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      return b.total - a.total;
    })
    .slice(0, params.limit);
}

export type MerchantTopCustomersSplit = {
  today: MerchantTopCustomerRow[];
  lifetime: MerchantTopCustomerRow[];
  todayYmd: string;
};

/**
 * Daily top = today's buyers ranked by today's spend.
 * Lifetime top = all-time buyers ranked by distinct purchase days.
 * Groups by phone/email — never by order name (often an SI number).
 */
export async function fetchMerchantTopCustomersBySales(
  companyId: string,
  merchantUserId: string,
  params?: { limit?: number },
): Promise<MerchantTopCustomersSplit> {
  const limit = params?.limit ?? 10;
  const todayYmd = formatAppIsoDate(new Date());

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      assignedMerchantId: merchantUserId,
      cancelledAt: null,
    },
    select: {
      totalPrice: true,
      name: true,
      customerId: true,
      customerPhone: true,
      customerEmail: true,
      createdAt: true,
      shippingAddress: true,
      customer: { select: { firstName: true, lastName: true } },
    },
    take: 8_000,
    orderBy: { createdAt: "desc" },
  });

  const todayOrders = orders.filter(
    (order) => formatAppIsoDate(order.createdAt) === todayYmd,
  );

  return {
    todayYmd,
    today: aggregateTopCustomers(todayOrders, { limit, rankBy: "total" }),
    lifetime: aggregateTopCustomers(orders, { limit, rankBy: "purchaseDays" }),
  };
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
