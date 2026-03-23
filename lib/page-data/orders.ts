import { Prisma } from "@prisma/client";
import type { FulfillmentStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cuidSchema, orderPaymentGatewayFilterSchema } from "@/lib/validation";
import { maybeLogSlowDbRequest } from "@/lib/dbObservability";

export type OrdersPageParams = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  locationId?: string | null;
  sourceFilter?: string | null;
  merchantId?: string | null;
  search?: string | null;
  fulfillmentStages?: string | null;
  /** Inclusive bounds on `Order.createdAt` (typically from dashboard date filters). */
  createdFrom?: Date;
  createdTo?: Date;
  /** Match orders whose `paymentGatewayNames` contains this string (Shopify gateway name). */
  paymentGateway?: string | null;
};

async function fetchDistinctPaymentGatewayNames(companyId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ name: string }[]>(
    Prisma.sql`
      SELECT DISTINCT trim(u) AS name
      FROM "Order", unnest("paymentGatewayNames") AS u
      WHERE "companyId" = ${companyId}
      ORDER BY 1
    `
  );
  return rows.map((r) => r.name).filter((n) => n.length > 0);
}

export async function fetchOrdersPageData(companyId: string, params: OrdersPageParams = {}) {
  const startedAt = Date.now();
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const sortOrder = params.sortOrder ?? "desc";
  const sortBy = params.sortBy?.trim();
  const skip = (page - 1) * limit;

  const SORT_FIELDS: Record<string, Prisma.OrderOrderByWithRelationInput> = {
    created: { createdAt: sortOrder },
    total: { totalPrice: sortOrder },
    order_number: { orderNumber: sortOrder },
    name: { name: sortOrder },
    source: { sourceName: sortOrder },
    location: { companyLocation: { name: sortOrder } },
    merchant: { assignedMerchant: { name: sortOrder } },
  };
  const orderBy: Prisma.OrderOrderByWithRelationInput =
    sortBy && sortBy in SORT_FIELDS ? SORT_FIELDS[sortBy]! : { createdAt: "desc" };

  const where: Prisma.OrderWhereInput = { companyId };

  if (params.locationId) {
    const idResult = cuidSchema.safeParse(params.locationId);
    if (idResult.success) {
      where.companyLocationId = idResult.data;
    }
  }

  if (params.sourceFilter === "pos" || params.sourceFilter === "web") {
    where.sourceName = params.sourceFilter;
  }

  if (params.merchantId) {
    const idResult = cuidSchema.safeParse(params.merchantId);
    if (idResult.success) {
      where.assignedMerchantId = idResult.data;
    }
  }

  const gatewayParsed = orderPaymentGatewayFilterSchema.safeParse(params.paymentGateway ?? undefined);
  if (gatewayParsed.success && gatewayParsed.data) {
    where.paymentGatewayNames = { has: gatewayParsed.data };
  }

  if (params.search?.trim()) {
    where.OR = [
      { orderNumber: { contains: params.search.trim(), mode: "insensitive" } },
      { name: { contains: params.search.trim(), mode: "insensitive" } },
      { customerEmail: { contains: params.search.trim(), mode: "insensitive" } },
      { customerPhone: { contains: params.search.trim(), mode: "insensitive" } },
    ];
  }

  const VALID_STAGES = [
    "order_received",
    "sample_free_issue",
    "print",
    "ready_to_dispatch",
    "dispatched",
    "invoice_complete",
    "delivery_complete",
  ] as const;
  if (params.fulfillmentStages?.trim()) {
    const stages = params.fulfillmentStages
      .trim()
      .split(",")
      .map((s) => s.trim())
      .filter((s) => VALID_STAGES.includes(s as (typeof VALID_STAGES)[number]));
    if (stages.length > 0) {
      where.fulfillmentStage = { in: stages as FulfillmentStage[] };
      where.sourceName = "web";
    }
  }

  if (params.createdFrom || params.createdTo) {
    where.createdAt = {
      ...(params.createdFrom ? { gte: params.createdFrom } : {}),
      ...(params.createdTo ? { lte: params.createdTo } : {}),
    };
  }

  const orderSelect: Prisma.OrderSelect = {
    id: true,
    shopifyOrderId: true,
    orderNumber: true,
    name: true,
    sourceName: true,
    totalPrice: true,
    currency: true,
    financialStatus: true,
    fulfillmentStatus: true,
    customerEmail: true,
    customerPhone: true,
    createdAt: true,
    fulfillmentStage: true,
    printCount: true,
    packageOnHoldAt: true,
    companyLocation: { select: { id: true, name: true } },
    assignedMerchant: { select: { id: true, name: true, email: true } },
    packageHoldReason: { select: { id: true, name: true } },
    paymentGatewayNames: true,
    paymentGatewayPrimary: true,
    _count: { select: { lineItems: true } },
  };

  const [total, orders, locations, merchants, paymentGatewayOptions] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: orderSelect,
    }),
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        companyId,
        OR: [
          { shopifyUserIds: { isEmpty: false } },
          { couponCodes: { isEmpty: false } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    fetchDistinctPaymentGatewayNames(companyId),
  ]);

  const ordersData = orders.map((o) => ({
    id: o.id,
    shopifyOrderId: o.shopifyOrderId,
    orderNumber: o.orderNumber,
    name: o.name,
    sourceName: o.sourceName,
    totalPrice: o.totalPrice.toString(),
    currency: o.currency,
    financialStatus: o.financialStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    createdAt: o.createdAt.toISOString(),
    companyLocation: o.companyLocation,
    assignedMerchant: o.assignedMerchant,
    lineItemCount: o._count.lineItems,
    printCount: o.printCount,
    packageOnHoldAt: o.packageOnHoldAt?.toISOString() ?? null,
    packageHoldReason: o.packageHoldReason,
    fulfillmentStage: o.fulfillmentStage,
    paymentGatewayNames: o.paymentGatewayNames,
    paymentGatewayPrimary: o.paymentGatewayPrimary,
  }));

  maybeLogSlowDbRequest("orders.page_data", startedAt, {
    companyId,
    page,
    limit,
    total,
  });

  return {
    orders: ordersData,
    total,
    page,
    limit,
    locations,
    merchants,
    paymentGatewayOptions,
  };
}
