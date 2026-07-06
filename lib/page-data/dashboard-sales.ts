import type { Prisma } from "@prisma/client";

import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { prisma } from "@/lib/prisma";

export type DashboardLocationMerchantRow = {
  merchantId: string | null;
  merchantName: string;
  total: number;
  orderCount: number;
};

export type DashboardLocationSales = {
  id: string;
  name: string;
  defaultMerchantId: string | null;
  defaultMerchantName: string | null;
  merchants: DashboardLocationMerchantRow[];
  sources: Array<{
    sourceName: string;
    total: number;
    orderCount: number;
  }>;
};

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

function getUserDisplayName(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
} | null | undefined) {
  return user?.knownName?.trim() || user?.name?.trim() || user?.email?.trim() || null;
}

const DASHBOARD_INVOICE_DATE_FINANCIAL_STATUSES = new Set(["paid", "pending"]);
const DASHBOARD_POS_SOURCE_NAMES = new Set(["pos", "erpnext-pos"]);
const DASHBOARD_DELIVERED_STATUSES = new Set([
  "delivered",
  "delivery complete",
  "delivery_complete",
  "complete",
  "completed",
  "fulfilled",
]);

export type DashboardSalesDateType = "order" | "completed";

export type DashboardSalesEligibilityOrder = {
  sourceName: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  fulfillmentStage?: string | null;
  deliveryOutcome?: string | null;
  deliveryCompleteAt?: Date | null;
  rawPayload?: Prisma.JsonValue | null;
};

export function buildDashboardSalesDateFilter(params: {
  fromDate: Date;
  toDate: Date;
  dateType: DashboardSalesDateType;
}): Prisma.OrderWhereInput {
  return params.dateType === "order"
    ? { createdAt: { gte: params.fromDate, lte: params.toDate } }
    : {
        invoiceCompleteAt: {
          not: null,
          gte: params.fromDate,
          lte: params.toDate,
        },
      };
}

function normalizeStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isPosOrder(sourceName: string | null | undefined) {
  return DASHBOARD_POS_SOURCE_NAMES.has(normalizeStatus(sourceName));
}

function readPayloadString(rawPayload: Prisma.JsonValue | null | undefined, key: string) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return "";
  }

  const value = (rawPayload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function isDeliveredStatus(value: unknown) {
  const normalized = normalizeStatus(value).replace(/\s+/g, " ");
  if (!normalized) return false;
  return (
    DASHBOARD_DELIVERED_STATUSES.has(normalized) ||
    (normalized.includes("delivered") && !normalized.includes("not delivered"))
  );
}

function isPosDeliveryComplete(order: DashboardSalesEligibilityOrder) {
  return (
    isDeliveredStatus(order.deliveryOutcome) ||
    isDeliveredStatus(readPayloadString(order.rawPayload, "delivery_status")) ||
    isDeliveredStatus(readPayloadString(order.rawPayload, "deliveryStatus")) ||
    isDeliveredStatus(readPayloadString(order.rawPayload, "status")) ||
    normalizeStatus(order.fulfillmentStage) === "delivery_complete" ||
    order.deliveryCompleteAt != null
  );
}

export function isDashboardSalesOrderEligible(
  order: DashboardSalesEligibilityOrder,
  dateType: DashboardSalesDateType,
) {
  if (dateType === "order") {
    return DASHBOARD_INVOICE_DATE_FINANCIAL_STATUSES.has(
      normalizeStatus(order.financialStatus),
    );
  }

  if (isPosOrder(order.sourceName)) {
    return isPosDeliveryComplete(order);
  }

  return normalizeStatus(order.fulfillmentStatus) === "fulfilled";
}

/**
 * Aggregates order totals by assigned merchant per company location for the dashboard.
 */
export async function fetchDashboardSalesByLocationMerchant(
  companyId: string,
  params: {
    fromYmd: string;
    toYmd: string;
    dateType: "order" | "completed";
  },
): Promise<{ locations: DashboardLocationSales[]; invalidRange: boolean }> {
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) {
    return { locations: [], invalidRange: true };
  }

  // "order" = invoice date (same field used on printed invoices: Order.createdAt).
  // "completed" = invoice completed timestamp (packing/payment workflow).
  const dateFilter = buildDashboardSalesDateFilter({
    fromDate,
    toDate,
    dateType: params.dateType,
  });

  const where: Prisma.OrderWhereInput = {
    companyId,
    ...dateFilter,
  };

  const [locations, usersWithCoupons, orders] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultMerchantUserId: true,
        defaultMerchant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { companyId, couponCodes: { isEmpty: false } },
      select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
    }),
    prisma.order.findMany({
      where,
      select: {
        companyLocationId: true,
        assignedMerchantId: true,
        totalPrice: true,
        sourceName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        deliveryOutcome: true,
        deliveryCompleteAt: true,
        discountCodes: true,
        rawPayload: true,
        assignedMerchant: {
          select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
        },
      },
    }),
  ]);

  const couponToUser = new Map<string, { id: string; name: string }>();
  for (const user of usersWithCoupons) {
    const name = getUserDisplayName(user) ?? "Unknown";
    for (const code of user.couponCodes) {
      const normalized = code.trim().toLowerCase();
      if (normalized && !couponToUser.has(normalized)) {
        couponToUser.set(normalized, { id: user.id, name });
      }
    }
  }

  const byLocationMerchant = new Map<string, Map<string, DashboardLocationMerchantRow>>();
  const sourceByLocation = new Map<string, DashboardLocationSales["sources"]>();
  for (const loc of locations) {
    byLocationMerchant.set(loc.id, new Map());
    sourceByLocation.set(loc.id, []);
  }

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, params.dateType)) continue;

    const merchantMap = byLocationMerchant.get(order.companyLocationId);
    if (!merchantMap) continue;

    let merchantId: string | null = null;
    let merchantName: string | null = null;

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

    for (const code of merchantCoupons) {
      const matchedUser = couponToUser.get(code);
      if (matchedUser) {
        merchantId = matchedUser.id;
        merchantName = matchedUser.name;
        break;
      }
    }

    if (!merchantName) {
      merchantId = order.assignedMerchantId;
      merchantName = getUserDisplayName(order.assignedMerchant) ?? "DM-General";
    }

    const merchantKey = merchantId ?? `__${merchantName.toLowerCase()}`;
    const existing = merchantMap.get(merchantKey);
    const total = Number(order.totalPrice ?? 0);
    if (existing) {
      existing.total += total;
      existing.orderCount += 1;
    } else {
      merchantMap.set(merchantKey, {
        merchantId,
        merchantName,
        total,
        orderCount: 1,
      });
    }

    const sourceList = sourceByLocation.get(order.companyLocationId);
    if (sourceList) {
      const sourceName = order.sourceName?.trim() || "unknown";
      const existingSource = sourceList.find((row) => row.sourceName === sourceName);
      if (existingSource) {
        existingSource.total += total;
        existingSource.orderCount += 1;
      } else {
        sourceList.push({ sourceName, total, orderCount: 1 });
      }
    }
  }

  const locationsOut: DashboardLocationSales[] = locations.map((loc) => {
    const merchantsRows = [...(byLocationMerchant.get(loc.id)?.values() ?? [])].sort((a, b) => b.total - a.total);
    const sourcesRows = (sourceByLocation.get(loc.id) ?? []).sort((a, b) => b.total - a.total);
    return {
      id: loc.id,
      name: loc.name,
      defaultMerchantId: loc.defaultMerchantUserId,
      defaultMerchantName: loc.defaultMerchant?.name ?? null,
      merchants: merchantsRows,
      sources: sourcesRows,
    };
  });

  return { locations: locationsOut, invalidRange: false };
}

/**
 * Same shape as merchant breakdown, but segments are primary payment gateways (Shopify
 * `payment_gateway_names` first entry). Full order total is attributed to that gateway only.
 */
export async function fetchDashboardSalesByLocationGateway(
  companyId: string,
  params: {
    fromYmd: string;
    toYmd: string;
    dateType: "order" | "completed";
  },
): Promise<{ locations: DashboardLocationSales[]; invalidRange: boolean }> {
  const gatewayColumns = await getOrderPaymentGatewayColumnState();
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) {
    return { locations: [], invalidRange: true };
  }

  const dateFilter = buildDashboardSalesDateFilter({
    fromDate,
    toDate,
    dateType: params.dateType,
  });

  const where: Prisma.OrderWhereInput = {
    companyId,
    ...dateFilter,
  };

  if (!gatewayColumns.hasPaymentGatewayPrimary) {
    const locations = await prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultMerchantUserId: true,
        defaultMerchant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      locations: locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        defaultMerchantId: loc.defaultMerchantUserId,
        defaultMerchantName: loc.defaultMerchant?.name ?? null,
        merchants: [],
        sources: [],
      })),
      invalidRange: false,
    };
  }

  const [locations, orders] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultMerchantUserId: true,
        defaultMerchant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.order.findMany({
      where,
      select: {
        companyLocationId: true,
        totalPrice: true,
        sourceName: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        deliveryOutcome: true,
        deliveryCompleteAt: true,
        rawPayload: true,
        paymentGatewayPrimary: true,
      },
    }),
  ]);

  const byLocation = new Map<string, DashboardLocationMerchantRow[]>();
  const sourceByLocation = new Map<string, DashboardLocationSales["sources"]>();
  for (const loc of locations) {
    byLocation.set(loc.id, []);
    sourceByLocation.set(loc.id, []);
  }

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, params.dateType)) continue;

    const list = byLocation.get(order.companyLocationId);
    if (!list) continue;

    const gatewayLabel = order.paymentGatewayPrimary?.trim() || "Unspecified";
    const total = Number(order.totalPrice ?? 0);
    const existingGateway = list.find((row) => row.merchantName === gatewayLabel);
    if (existingGateway) {
      existingGateway.total += total;
      existingGateway.orderCount += 1;
    } else {
      list.push({
        merchantId: null,
        merchantName: gatewayLabel,
        total,
        orderCount: 1,
      });
    }

    const sourceList = sourceByLocation.get(order.companyLocationId);
    if (sourceList) {
      const sourceName = order.sourceName?.trim() || "unknown";
      const existingSource = sourceList.find((row) => row.sourceName === sourceName);
      if (existingSource) {
        existingSource.total += total;
        existingSource.orderCount += 1;
      } else {
        sourceList.push({ sourceName, total, orderCount: 1 });
      }
    }
  }

  const locationsOut: DashboardLocationSales[] = locations.map((loc) => {
    const merchantsRows = (byLocation.get(loc.id) ?? []).sort((a, b) => b.total - a.total);
    const sourcesRows = (sourceByLocation.get(loc.id) ?? []).sort((a, b) => b.total - a.total);
    return {
      id: loc.id,
      name: loc.name,
      defaultMerchantId: loc.defaultMerchantUserId,
      defaultMerchantName: loc.defaultMerchant?.name ?? null,
      merchants: merchantsRows,
      sources: sourcesRows,
    };
  });

  return { locations: locationsOut, invalidRange: false };
}
