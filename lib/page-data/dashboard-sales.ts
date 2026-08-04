import type { Prisma } from "@prisma/client";

import {
  applyMerchantGroup,
  buildCouponToMerchantMap,
  getMerchantGroupUserMap,
} from "@/lib/merchant-groups";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import {
  filterAddsToAllOrders,
  getDashboardSalesDateTypeLabel,
  getDashboardSalesFilterGroup,
  type DashboardFilterSummary,
  type DashboardSalesDateType,
} from "@/lib/page-data/dashboard-overview-shared";
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

function isPhysicallyDelivered(order: DashboardSalesEligibilityOrder) {
  return (
    order.deliveryCompleteAt != null ||
    normalizeStatus(order.fulfillmentStage) === "delivery_complete"
  );
}

/**
 * Mutually exclusive Group A status partition for place-date tallies.
 * Bill done early = invoice complete and deliveryCompleteAt null (counted once).
 */
export function getPlacedStatusPartition(
  order: DashboardSalesEligibilityOrder,
): "not_delivered" | "bill_done_early" | "bill_open" | "done_after_delivery" {
  const hasInvoice = order.invoiceCompleteAt != null;
  if (hasInvoice && order.deliveryCompleteAt == null) return "bill_done_early";
  const delivered = isPhysicallyDelivered(order);
  if (delivered && !hasInvoice) return "bill_open";
  if (delivered && hasInvoice) return "done_after_delivery";
  return "not_delivered";
}

/** @deprecated Prefer getPlacedStatusPartition */
export function getPlacedDashboardSalesBucket(order: DashboardSalesEligibilityOrder) {
  return getPlacedStatusPartition(order);
}

const POS_SOURCE_NOT_IN = [...DASHBOARD_POS_SOURCE_NAMES];

function deliveredCandidateWhere(): Prisma.OrderWhereInput {
  return {
    OR: [
      { deliveryCompleteAt: { not: null } },
      { fulfillmentStage: "delivery_complete" },
    ],
  };
}

export function buildDashboardSalesDateFilter(params: {
  fromDate: Date;
  toDate: Date;
  dateType: DashboardSalesDateType;
}): Prisma.OrderWhereInput {
  const createdInRange: Prisma.OrderWhereInput = {
    createdAt: { gte: params.fromDate, lte: params.toDate },
  };
  const eventInRange = (field: "invoiceCompleteAt" | "deliveryCompleteAt") => ({
    [field]: {
      not: null,
      gte: params.fromDate,
      lte: params.toDate,
    },
  });

  switch (params.dateType) {
    case "all_orders":
      return createdInRange;

    case "bill_done_early":
      return {
        ...createdInRange,
        invoiceCompleteAt: { not: null },
        deliveryCompleteAt: null,
      };

    case "not_delivered":
      return {
        ...createdInRange,
        invoiceCompleteAt: null,
        deliveryCompleteAt: null,
        NOT: { fulfillmentStage: "delivery_complete" },
      };

    case "bill_open":
      return {
        ...createdInRange,
        invoiceCompleteAt: null,
        ...deliveredCandidateWhere(),
      };

    case "done_after_delivery":
      return {
        ...createdInRange,
        invoiceCompleteAt: { not: null },
        deliveryCompleteAt: { not: null },
      };

    case "bill_done_in_dates":
      return {
        ...createdInRange,
        ...eventInRange("invoiceCompleteAt"),
      };

    case "delivered_in_dates":
      return {
        ...createdInRange,
        ...eventInRange("deliveryCompleteAt"),
        fulfillmentStage: "delivery_complete",
        financialStatus: { not: "voided" },
        sourceName: { notIn: POS_SOURCE_NOT_IN },
      };

    case "bill_done_old":
      return {
        ...eventInRange("invoiceCompleteAt"),
        createdAt: { lt: params.fromDate },
      };

    case "delivered_old":
      return {
        ...eventInRange("deliveryCompleteAt"),
        createdAt: { lt: params.fromDate },
        fulfillmentStage: "delivery_complete",
        financialStatus: { not: "voided" },
        sourceName: { notIn: POS_SOURCE_NOT_IN },
      };

    case "still_bill_open":
      return {
        invoiceCompleteAt: null,
        financialStatus: { not: "voided" },
        sourceName: { notIn: POS_SOURCE_NOT_IN },
        ...deliveredCandidateWhere(),
      };

    case "still_not_delivered":
      return {
        deliveryCompleteAt: null,
        fulfillmentStage: { not: "delivery_complete" },
        financialStatus: { not: "voided" },
        sourceName: { notIn: POS_SOURCE_NOT_IN },
      };
  }
}

export function isDashboardSalesOrderEligible(
  order: DashboardSalesEligibilityOrder,
  dateType: DashboardSalesDateType,
) {
  const statusKeys = new Set<DashboardSalesDateType>([
    "all_orders",
    "not_delivered",
    "bill_done_early",
    "bill_open",
    "done_after_delivery",
  ]);

  if (statusKeys.has(dateType)) {
    if (!isPaidOrPending(order.financialStatus)) return false;
    if (dateType === "all_orders") return true;
    return getPlacedStatusPartition(order) === dateType;
  }

  if (dateType === "delivered_in_dates" || dateType === "delivered_old") {
    return (
      !isPosOrder(order.sourceName) &&
      normalizeStatus(order.financialStatus) !== "voided" &&
      normalizeStatus(order.fulfillmentStage) === "delivery_complete" &&
      order.deliveryCompleteAt != null
    );
  }

  if (dateType === "still_bill_open") {
    return (
      !isPosOrder(order.sourceName) &&
      normalizeStatus(order.financialStatus) !== "voided" &&
      order.invoiceCompleteAt == null &&
      isPhysicallyDelivered(order)
    );
  }

  if (dateType === "still_not_delivered") {
    return (
      !isPosOrder(order.sourceName) &&
      normalizeStatus(order.financialStatus) !== "voided" &&
      order.deliveryCompleteAt == null &&
      normalizeStatus(order.fulfillmentStage) !== "delivery_complete"
    );
  }

  // bill_done_in_dates / bill_done_old — date filter already scopes invoiceCompleteAt.
  if (normalizeStatus(order.financialStatus) === "voided") return false;
  if (isPosOrder(order.sourceName)) return true;
  return normalizeStatus(order.fulfillmentStatus) === "fulfilled";
}

function emptySummary(key: DashboardSalesDateType): DashboardFilterSummary {
  return {
    key,
    group: getDashboardSalesFilterGroup(key),
    label: getDashboardSalesDateTypeLabel(key),
    total: 0,
    orderCount: 0,
    addsToAllOrders: filterAddsToAllOrders(key),
  };
}

function addToSummary(summary: DashboardFilterSummary, totalPrice: unknown) {
  summary.total += Number(totalPrice ?? 0);
  summary.orderCount += 1;
}

/**
 * Company-wide chip totals for Group A/B (range-scoped) and Group C (backlog).
 */
export async function fetchDashboardFilterSummaries(
  companyId: string,
  fromYmd: string,
  toYmd: string,
): Promise<{ filterSummaries: DashboardFilterSummary[]; invalidRange: boolean }> {
  const fromDate = parseDayStartUtc(fromYmd);
  const toDate = parseDayEndUtc(toYmd);
  if (fromDate > toDate) {
    return { filterSummaries: [], invalidRange: true };
  }

  const summaryKeys: DashboardSalesDateType[] = [
    "all_orders",
    "not_delivered",
    "bill_done_early",
    "bill_open",
    "done_after_delivery",
    "bill_done_in_dates",
    "delivered_in_dates",
    "bill_done_old",
    "delivered_old",
    "still_bill_open",
    "still_not_delivered",
  ];
  const summaries = new Map<DashboardSalesDateType, DashboardFilterSummary>(
    summaryKeys.map((key) => [key, emptySummary(key)]),
  );

  const eligibilitySelect = {
    totalPrice: true,
    createdAt: true,
    sourceName: true,
    financialStatus: true,
    fulfillmentStatus: true,
    fulfillmentStage: true,
    deliveryCompleteAt: true,
    invoiceCompleteAt: true,
  } as const;

  const [rangeOrders, backlogBillOpen, backlogNotDelivered] = await Promise.all([
    prisma.order.findMany({
      where: {
        companyId,
        OR: [
          { createdAt: { gte: fromDate, lte: toDate } },
          { invoiceCompleteAt: { gte: fromDate, lte: toDate } },
          { deliveryCompleteAt: { gte: fromDate, lte: toDate } },
        ],
      },
      select: eligibilitySelect,
    }),
    prisma.order.findMany({
      where: {
        companyId,
        ...buildDashboardSalesDateFilter({
          fromDate,
          toDate,
          dateType: "still_bill_open",
        }),
      },
      select: { totalPrice: true, sourceName: true, financialStatus: true, fulfillmentStatus: true, fulfillmentStage: true, deliveryCompleteAt: true, invoiceCompleteAt: true },
    }),
    prisma.order.findMany({
      where: {
        companyId,
        ...buildDashboardSalesDateFilter({
          fromDate,
          toDate,
          dateType: "still_not_delivered",
        }),
      },
      select: { totalPrice: true, sourceName: true, financialStatus: true, fulfillmentStatus: true, fulfillmentStage: true, deliveryCompleteAt: true, invoiceCompleteAt: true },
    }),
  ]);

  for (const order of rangeOrders) {
    const createdInRange = order.createdAt >= fromDate && order.createdAt <= toDate;
    const invoiceInRange =
      order.invoiceCompleteAt != null &&
      order.invoiceCompleteAt >= fromDate &&
      order.invoiceCompleteAt <= toDate;
    const deliveryInRange =
      order.deliveryCompleteAt != null &&
      order.deliveryCompleteAt >= fromDate &&
      order.deliveryCompleteAt <= toDate;
    const placedBeforeRange = order.createdAt < fromDate;

    if (createdInRange && isDashboardSalesOrderEligible(order, "all_orders")) {
      addToSummary(summaries.get("all_orders")!, order.totalPrice);
      const partition = getPlacedStatusPartition(order);
      addToSummary(summaries.get(partition)!, order.totalPrice);
    }

    if (
      createdInRange &&
      invoiceInRange &&
      isDashboardSalesOrderEligible(order, "bill_done_in_dates")
    ) {
      addToSummary(summaries.get("bill_done_in_dates")!, order.totalPrice);
    }

    if (
      createdInRange &&
      deliveryInRange &&
      isDashboardSalesOrderEligible(order, "delivered_in_dates")
    ) {
      addToSummary(summaries.get("delivered_in_dates")!, order.totalPrice);
    }

    if (
      placedBeforeRange &&
      invoiceInRange &&
      isDashboardSalesOrderEligible(order, "bill_done_old")
    ) {
      addToSummary(summaries.get("bill_done_old")!, order.totalPrice);
    }

    if (
      placedBeforeRange &&
      deliveryInRange &&
      isDashboardSalesOrderEligible(order, "delivered_old")
    ) {
      addToSummary(summaries.get("delivered_old")!, order.totalPrice);
    }
  }

  for (const order of backlogBillOpen) {
    if (isDashboardSalesOrderEligible(order, "still_bill_open")) {
      addToSummary(summaries.get("still_bill_open")!, order.totalPrice);
    }
  }
  for (const order of backlogNotDelivered) {
    if (isDashboardSalesOrderEligible(order, "still_not_delivered")) {
      addToSummary(summaries.get("still_not_delivered")!, order.totalPrice);
    }
  }

  return {
    filterSummaries: summaryKeys.map((key) => summaries.get(key)!),
    invalidRange: false,
  };
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
