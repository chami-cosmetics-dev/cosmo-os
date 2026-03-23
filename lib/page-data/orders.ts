import type { FulfillmentStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cuidSchema } from "@/lib/validation";
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
};

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

  const [total, orders, locations, merchants] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        companyLocation: { select: { id: true, name: true } },
        assignedMerchant: { select: { id: true, name: true, email: true } },
        packageHoldReason: { select: { id: true, name: true } },
        _count: { select: { lineItems: true } },
      },
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
  };
}
