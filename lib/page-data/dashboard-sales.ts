import type { Prisma } from "@prisma/client";

import {
  applyMerchantGroup,
  buildCouponToMerchantMap,
  getMerchantGroupUserMap,
} from "@/lib/merchant-groups";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import type { DashboardSalesDateType } from "@/lib/page-data/dashboard-overview-shared";
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

export type DashboardSalesEligibilityOrder = {
  sourceName: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  fulfillmentStage?: string | null;
  deliveryOutcome?: string | null;
  deliveryCompleteAt?: Date | null;
  invoiceCompleteAt?: Date | null;
  rawPayload?: Prisma.JsonValue | null;
};

function normalizeStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isPosOrder(sourceName: string | null | undefined) {
  return DASHBOARD_POS_SOURCE_NAMES.has(normalizeStatus(sourceName));
}

function isPaidOrPending(financialStatus: string | null | undefined) {
  return DASHBOARD_INVOICE_DATE_FINANCIAL_STATUSES.has(normalizeStatus(financialStatus));
}

/** Non-POS order that has been delivery-completed (still may await invoice close). */
function isNonPosDeliveredPendingCandidate(order: DashboardSalesEligibilityOrder) {
  if (isPosOrder(order.sourceName)) return false;
  return (
    order.deliveryCompleteAt != null ||
    normalizeStatus(order.fulfillmentStage) === "delivery_complete"
  );
}

/**
 * Mutually exclusive placed-bucket for create-date tallies.
 * closed → pending → open (POS without close stays in open).
 */
export function getPlacedDashboardSalesBucket(
  order: DashboardSalesEligibilityOrder,
): "placed_invoice_completed" | "placed_pending_invoice" | "placed_open" {
  if (order.invoiceCompleteAt != null) return "placed_invoice_completed";
  if (isNonPosDeliveredPendingCandidate(order)) return "placed_pending_invoice";
  return "placed_open";
}

export function buildDashboardSalesDateFilter(params: {
  fromDate: Date;
  toDate: Date;
  dateType: DashboardSalesDateType;
}): Prisma.OrderWhereInput {
  const createdInRange: Prisma.OrderWhereInput = {
    createdAt: { gte: params.fromDate, lte: params.toDate },
  };

  if (params.dateType === "placed_all") {
    return createdInRange;
  }

  if (params.dateType === "placed_invoice_completed") {
    return {
      ...createdInRange,
      invoiceCompleteAt: { not: null },
    };
  }

  if (params.dateType === "placed_pending_invoice") {
    return {
      ...createdInRange,
      invoiceCompleteAt: null,
      sourceName: { notIn: [...DASHBOARD_POS_SOURCE_NAMES] },
      OR: [
        { deliveryCompleteAt: { not: null } },
        { fulfillmentStage: "delivery_complete" },
      ],
    };
  }

  if (params.dateType === "placed_open") {
    // Not closed, and not in the non-POS delivered-pending bucket.
    return {
      ...createdInRange,
      invoiceCompleteAt: null,
      NOT: {
        AND: [
          { sourceName: { notIn: [...DASHBOARD_POS_SOURCE_NAMES] } },
          {
            OR: [
              { deliveryCompleteAt: { not: null } },
              { fulfillmentStage: "delivery_complete" },
            ],
          },
        ],
      },
    };
  }

  if (params.dateType === "delivered_all") {
    // Match delivery-complete report rows: delivered in range and still at that stage.
    return {
      deliveryCompleteAt: {
        not: null,
        gte: params.fromDate,
        lte: params.toDate,
      },
      fulfillmentStage: "delivery_complete",
      financialStatus: { not: "voided" },
      sourceName: { notIn: [...DASHBOARD_POS_SOURCE_NAMES] },
    };
  }

  if (params.dateType === "delivered_pending_invoice") {
    return {
      deliveryCompleteAt: {
        not: null,
        gte: params.fromDate,
        lte: params.toDate,
      },
      invoiceCompleteAt: null,
      fulfillmentStage: "delivery_complete",
      financialStatus: { not: "voided" },
      sourceName: { notIn: [...DASHBOARD_POS_SOURCE_NAMES] },
    };
  }

  // closed_in_period
  return {
    invoiceCompleteAt: {
      not: null,
      gte: params.fromDate,
      lte: params.toDate,
    },
  };
}

export function isDashboardSalesOrderEligible(
  order: DashboardSalesEligibilityOrder,
  dateType: DashboardSalesDateType,
) {
  if (
    dateType === "placed_all" ||
    dateType === "placed_open" ||
    dateType === "placed_pending_invoice" ||
    dateType === "placed_invoice_completed"
  ) {
    if (!isPaidOrPending(order.financialStatus)) return false;
    if (dateType === "placed_all") return true;
    return getPlacedDashboardSalesBucket(order) === dateType;
  }

  if (dateType === "delivered_all") {
    return (
      !isPosOrder(order.sourceName) &&
      normalizeStatus(order.financialStatus) !== "voided" &&
      normalizeStatus(order.fulfillmentStage) === "delivery_complete" &&
      order.deliveryCompleteAt != null
    );
  }

  if (dateType === "delivered_pending_invoice") {
    return (
      !isPosOrder(order.sourceName) &&
      normalizeStatus(order.financialStatus) !== "voided" &&
      normalizeStatus(order.fulfillmentStage) === "delivery_complete" &&
      order.deliveryCompleteAt != null &&
      order.invoiceCompleteAt == null
    );
  }

  // closed_in_period — date filter already requires invoiceCompleteAt.
  if (normalizeStatus(order.financialStatus) === "voided") return false;
  if (isPosOrder(order.sourceName)) return true;
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
    dateType: DashboardSalesDateType;
  },
): Promise<{ locations: DashboardLocationSales[]; invalidRange: boolean }> {
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) {
    return { locations: [], invalidRange: true };
  }

  // placed_* = createdAt buckets that tally; closed/delivered_* = other clocks.
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
        invoiceCompleteAt: true,
        discountCodes: true,
        rawPayload: true,
        assignedMerchant: {
          select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
        },
      },
    }),
  ]);

  const userToGroup = await getMerchantGroupUserMap(companyId);
  const couponToUser = buildCouponToMerchantMap(usersWithCoupons, userToGroup);

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
      const groupedMerchant = applyMerchantGroup(
        {
          id: order.assignedMerchantId,
          name: getUserDisplayName(order.assignedMerchant) ?? "DM-General",
        },
        userToGroup,
      );
      merchantId = groupedMerchant.id;
      merchantName = groupedMerchant.name;
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
    dateType: DashboardSalesDateType;
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
        invoiceCompleteAt: true,
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
