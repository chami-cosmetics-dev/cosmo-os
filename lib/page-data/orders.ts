import { Prisma } from "@prisma/client";
import type { FulfillmentStage } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { prisma } from "@/lib/prisma";
import { eligibleMerchantUserWhere } from "@/lib/merchant-eligibility";
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
  sampleSendLater?: "available" | "future" | "all";
  returnFilter?: "normal" | "rearrange";
  /** Dispatch search mode: Shopify at ready_to_dispatch only; ERP at order_received or ready_to_dispatch */
  dispatchMode?: boolean;
  /** Print queue mode: Shopify at print stage (unprinted); ERP at order_received/ready_to_dispatch/print (unprinted) */
  printMode?: boolean;
  /** Generic unprinted-only filter (printCount === 0) */
  unprintedOnly?: boolean;
};

function startOfTomorrowUtc() {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  ));
}

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

const getOrdersPageLookups = unstable_cache(
  async (companyId: string) => {
    const gatewayColumns = await getOrderPaymentGatewayColumnState();
    const [locations, merchants, paymentGatewayOptions] = await Promise.all([
      prisma.companyLocation.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: {
          AND: [
            eligibleMerchantUserWhere(companyId),
            {
              OR: [
                { shopifyUserIds: { isEmpty: false } },
                { couponCodes: { isEmpty: false } },
              ],
            },
          ],
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      }),
      gatewayColumns.hasPaymentGatewayNames
        ? fetchDistinctPaymentGatewayNames(companyId)
        : Promise.resolve([]),
    ]);

    return {
      locations,
      merchants,
      paymentGatewayOptions,
    };
  },
  ["orders-page-lookups"],
  { revalidate: 60 }
);

export async function fetchOrdersPageData(companyId: string, params: OrdersPageParams = {}) {
  const startedAt = Date.now();
  const gatewayColumns = await getOrderPaymentGatewayColumnState();
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
  if (
    gatewayColumns.hasPaymentGatewayNames &&
    gatewayParsed.success &&
    gatewayParsed.data
  ) {
    where.paymentGatewayNames = { has: gatewayParsed.data };
  }

  if (params.search?.trim()) {
    const searchTerm = params.search.trim();
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { orderNumber: { contains: searchTerm, mode: "insensitive" } },
          { name: { contains: searchTerm, mode: "insensitive" } },
          { customerEmail: { contains: searchTerm, mode: "insensitive" } },
          { customerPhone: { contains: searchTerm, mode: "insensitive" } },
          { erpnextInvoiceId: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
    ];
  }

  const VALID_STAGES = [
    "order_received",
    "sample_free_issue",
    "print",
    "returned_to_store",
    "ready_to_dispatch",
    "dispatched",
    "invoice_complete",
    "delivery_complete",
  ] as const;

  if (params.printMode) {
    // Shopify: only at print stage, unprinted
    // ERP: at order_received / ready_to_dispatch / print, unprinted (covers old and new orders)
    where.OR = [
      { sourceName: { in: ["web", "manual"] }, fulfillmentStage: "print", printCount: 0 },
      { sourceName: "erpnext", fulfillmentStage: { in: ["order_received", "ready_to_dispatch", "print"] }, printCount: 0 },
    ];
    where.financialStatus = { not: "voided" };
    where.NOT = {
      approvalRequests: {
        some: { type: "order_payment_approval", status: "pending" },
      },
    };
  } else if (params.dispatchMode) {
    // Shopify direct orders: only show when ready_to_dispatch (after sample stage)
    // ERP non-POS orders: show at order_received or ready_to_dispatch (skip sample stage)
    where.OR = [
      { sourceName: { in: ["web", "manual"] }, fulfillmentStage: "ready_to_dispatch" },
      { sourceName: "erpnext", fulfillmentStage: { in: ["order_received", "ready_to_dispatch"] } },
    ];
    where.financialStatus = { not: "voided" };
    where.NOT = {
      approvalRequests: {
        some: { type: "order_payment_approval", status: "pending" },
      },
    };
  } else if (params.fulfillmentStages?.trim()) {
    const stages = params.fulfillmentStages
      .trim()
      .split(",")
      .map((s) => s.trim())
      .filter((s) => VALID_STAGES.includes(s as (typeof VALID_STAGES)[number]));
    if (stages.length > 0) {
      where.fulfillmentStage = { in: stages as FulfillmentStage[] };
      // Sample page (only sample stages) = Shopify only; other pages include ERP non-POS
      const hasSampleStage = stages.some((s) => s === "order_received" || s === "sample_free_issue");
      const hasDispatchStage = stages.includes("ready_to_dispatch");
      where.sourceName = (hasSampleStage && !hasDispatchStage)
        ? { in: ["web", "manual"] }
        : { in: ["web", "manual", "erpnext"] };
      where.financialStatus = { not: "voided" };
      where.NOT = {
        approvalRequests: {
          some: { type: "order_payment_approval", status: "pending" },
        },
      };
      if (stages.includes("order_received") || stages.includes("sample_free_issue")) {
        const sampleSendLater = params.sampleSendLater ?? "available";
        const sendLaterFilter =
          sampleSendLater === "future"
            ? { sampleFreeIssueSendLaterDate: { gte: startOfTomorrowUtc() } }
            : sampleSendLater === "all"
              ? null
              : {
                  OR: [
                    { sampleFreeIssueSendLaterDate: null },
                    { sampleFreeIssueSendLaterDate: { lt: startOfTomorrowUtc() } },
                  ],
                };
        if (sendLaterFilter) {
          where.AND = [
            ...(Array.isArray(where.AND) ? where.AND : []),
            sendLaterFilter,
          ];
        }
      }
    }
  }

  if (params.unprintedOnly) {
    where.printCount = 0;
  }

  if (params.createdFrom || params.createdTo) {
    where.createdAt = {
      ...(params.createdFrom ? { gte: params.createdFrom } : {}),
      ...(params.createdTo ? { lte: params.createdTo } : {}),
    };
  }

  if (params.returnFilter === "rearrange") {
    where.returns = { some: { actionType: "rearrange" } };
  } else if (params.returnFilter === "normal") {
    where.returns = { none: {} };
  }

  const orderSelect = {
    id: true,
    shopifyOrderId: true,
    orderNumber: true,
    name: true,
    erpnextInvoiceId: true,
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
    sampleFreeIssueSendLaterDate: true,
    companyLocation: { select: { id: true, name: true } },
    assignedMerchant: { select: { id: true, name: true, email: true } },
    packageHoldReason: { select: { id: true, name: true } },
    _count: { select: { lineItems: true } },
    approvalRequests: {
      where: { type: "order_payment_approval", status: "pending" },
      select: { id: true },
      take: 1,
    },
    ...(gatewayColumns.hasPaymentGatewayNames ? { paymentGatewayNames: true } : {}),
    ...(gatewayColumns.hasPaymentGatewayPrimary ? { paymentGatewayPrimary: true } : {}),
  } satisfies Prisma.OrderSelect;

  const [total, orders, lookups] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: orderSelect,
    }),
    getOrdersPageLookups(companyId),
  ]);

  const ordersData = orders.map((o) => ({
    id: o.id,
    shopifyOrderId: o.shopifyOrderId,
    orderNumber: o.orderNumber,
    name: o.name,
    erpnextInvoiceId: o.erpnextInvoiceId,
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
    sampleFreeIssueSendLaterDate: o.sampleFreeIssueSendLaterDate?.toISOString() ?? null,
    packageHoldReason: o.packageHoldReason,
    fulfillmentStage: o.fulfillmentStage,
    paymentGatewayNames: "paymentGatewayNames" in o ? o.paymentGatewayNames : [],
    paymentGatewayPrimary: "paymentGatewayPrimary" in o ? o.paymentGatewayPrimary : null,
    pendingPaymentApproval: o.approvalRequests.length > 0,
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
    locations: lookups.locations,
    merchants: lookups.merchants,
    paymentGatewayOptions: lookups.paymentGatewayOptions,
  };
}
