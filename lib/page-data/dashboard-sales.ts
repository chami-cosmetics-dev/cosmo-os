import type { Prisma } from "@prisma/client";

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
  merchants: DashboardLocationMerchantRow[];
};

function parseDayStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function parseDayEndUtc(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999Z`);
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
  const dateFilter: Prisma.OrderWhereInput =
    params.dateType === "order"
      ? { createdAt: { gte: fromDate, lte: toDate } }
      : {
          invoiceCompleteAt: {
            not: null,
            gte: fromDate,
            lte: toDate,
          },
        };

  const where: Prisma.OrderWhereInput = {
    companyId,
    ...dateFilter,
  };

  const [locations, groups] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.order.groupBy({
      by: ["companyLocationId", "assignedMerchantId"],
      where,
      _sum: { totalPrice: true },
      _count: { _all: true },
    }),
  ]);

  const merchantIds = [
    ...new Set(groups.map((g) => g.assignedMerchantId).filter((id): id is string => id != null)),
  ];

  const merchants =
    merchantIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, name: true },
        })
      : [];

  const merchantNameById = new Map(merchants.map((m) => [m.id, m.name]));

  const byLocation = new Map<string, DashboardLocationMerchantRow[]>();
  for (const loc of locations) {
    byLocation.set(loc.id, []);
  }

  for (const g of groups) {
    const list = byLocation.get(g.companyLocationId);
    if (!list) continue;

    const merchantId = g.assignedMerchantId;
    const merchantName = merchantId
      ? (merchantNameById.get(merchantId) ?? "Unknown")
      : "Unassigned";
    const total = Number(g._sum.totalPrice ?? 0);
    const orderCount = g._count._all;

    list.push({
      merchantId,
      merchantName,
      total,
      orderCount,
    });
  }

  const locationsOut: DashboardLocationSales[] = locations.map((loc) => {
    const merchantsRows = (byLocation.get(loc.id) ?? []).sort((a, b) => b.total - a.total);
    return {
      id: loc.id,
      name: loc.name,
      merchants: merchantsRows,
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
  const fromDate = parseDayStartUtc(params.fromYmd);
  const toDate = parseDayEndUtc(params.toYmd);
  if (fromDate > toDate) {
    return { locations: [], invalidRange: true };
  }

  const dateFilter: Prisma.OrderWhereInput =
    params.dateType === "order"
      ? { createdAt: { gte: fromDate, lte: toDate } }
      : {
          invoiceCompleteAt: {
            not: null,
            gte: fromDate,
            lte: toDate,
          },
        };

  const where: Prisma.OrderWhereInput = {
    companyId,
    ...dateFilter,
  };

  const [locations, groups] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.order.groupBy({
      by: ["companyLocationId", "paymentGatewayPrimary"],
      where,
      _sum: { totalPrice: true },
      _count: { _all: true },
    }),
  ]);

  const byLocation = new Map<string, DashboardLocationMerchantRow[]>();
  for (const loc of locations) {
    byLocation.set(loc.id, []);
  }

  for (const g of groups) {
    const list = byLocation.get(g.companyLocationId);
    if (!list) continue;

    const gatewayLabel = g.paymentGatewayPrimary?.trim() || "Unspecified";
    const total = Number(g._sum.totalPrice ?? 0);
    const orderCount = g._count._all;

    list.push({
      merchantId: null,
      merchantName: gatewayLabel,
      total,
      orderCount,
    });
  }

  const locationsOut: DashboardLocationSales[] = locations.map((loc) => {
    const merchantsRows = (byLocation.get(loc.id) ?? []).sort((a, b) => b.total - a.total);
    return {
      id: loc.id,
      name: loc.name,
      merchants: merchantsRows,
    };
  });

  return { locations: locationsOut, invalidRange: false };
}
