import { Prisma } from "@prisma/client";
import type { FulfillmentStage } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";
import { prisma } from "@/lib/prisma";
import { eligibleMerchantUserWhere } from "@/lib/merchant-eligibility";
import { cuidSchema, orderPaymentGatewayFilterSchema } from "@/lib/validation";
import { DELIVERY_PAYMENT_APPROVAL, ORDER_PAYMENT_APPROVAL } from "@/lib/approval-workflow";
import { maybeLogSlowDbRequest } from "@/lib/dbObservability";
import { resolveStoredOrderCustomerName, enrichErpOrderCustomerNames } from "@/lib/erpnext-customer-display-name";

function pickOrderListCustomerName(order: {
  customer?: { firstName: string | null; lastName: string | null } | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  rawPayload?: unknown;
}): string | null {
  if (order.customer?.firstName || order.customer?.lastName) {
    const name = [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
  }
  return resolveStoredOrderCustomerName({
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    rawPayload: order.rawPayload,
  });
}

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
  /** Print history mode: orders with printCount > 0, optionally filtered by lastPrintedAt range */
  printHistoryMode?: boolean;
  /** Inclusive bounds on `Order.lastPrintedAt` (used by printHistoryMode). */
  lastPrintedFrom?: Date;
  lastPrintedTo?: Date;
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
    updated: { updatedAt: sortOrder },
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
          // suffix match: typing last digits finds orders ending with those digits
          { orderNumber: { endsWith: searchTerm, mode: "insensitive" } },
          { name: { endsWith: searchTerm, mode: "insensitive" } },
          { erpnextInvoiceId: { endsWith: searchTerm, mode: "insensitive" } },
          // substring match for contact fields
          { customerEmail: { contains: searchTerm, mode: "insensitive" } },
          { customerPhone: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
    ];
  }

  const VALID_STAGES = [
    "order_received",
    "sample_free_issue",
    "print",
    "returned_to_store",
    "returned",
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
    where.totalPrice = { gte: 0 };
    where.NOT = {
      approvalRequests: {
        some: { type: "order_payment_approval", status: "pending" },
      },
    };
  } else if (params.dispatchMode) {
    // Shopify direct orders: print or ready_to_dispatch (mirrors single dispatch selector)
    // ERP non-POS orders: order_received or ready_to_dispatch (skip sample stage)
    where.OR = [
      { sourceName: { in: ["web", "manual"] }, fulfillmentStage: { in: ["print", "ready_to_dispatch"] } },
      { sourceName: "erpnext", fulfillmentStage: { in: ["order_received", "print", "ready_to_dispatch"] } },
    ];
    where.financialStatus = { not: "voided" };
    where.totalPrice = { gte: 0 };
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

  // Exclude orders from locations that have been temporarily blocked from fulfillment
  if (params.printMode || params.dispatchMode || params.fulfillmentStages?.trim()) {
    where.companyLocation = { fulfillmentBlocked: false };
  }

  if (params.printHistoryMode) {
    where.printCount = { gt: 0 };
    where.sourceName = { in: ["web", "manual", "erpnext"] };
    where.financialStatus = { not: "voided" };
    if (params.lastPrintedFrom || params.lastPrintedTo) {
      where.lastPrintedAt = {
        ...(params.lastPrintedFrom ? { gte: params.lastPrintedFrom } : {}),
        ...(params.lastPrintedTo ? { lte: params.lastPrintedTo } : {}),
      };
    }
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
    discountCodes: true,
    totalPrice: true,
    currency: true,
    financialStatus: true,
    fulfillmentStatus: true,
    customerEmail: true,
    customerPhone: true,
    shippingAddress: true,
    billingAddress: true,
    rawPayload: true,
    createdAt: true,
    customer: { select: { firstName: true, lastName: true } },
    fulfillmentStage: true,
    printCount: true,
    lastPrintedAt: true,
    packageOnHoldAt: true,
    sampleFreeIssueSendLaterDate: true,
    companyLocation: { select: { id: true, name: true } },
    assignedMerchant: { select: { id: true, name: true, email: true, couponCodes: true } },
    packageHoldReason: { select: { id: true, name: true } },
    _count: { select: { lineItems: true } },
    approvalRequests: {
      where: {
        status: "pending",
        type: { in: [ORDER_PAYMENT_APPROVAL, DELIVERY_PAYMENT_APPROVAL] },
      },
      select: { id: true, type: true },
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

  const storedCustomerNames = new Map(
    orders.map((o) => [o.id, pickOrderListCustomerName(o)] as const),
  );
  const erpOrdersMissingName = orders.filter(
    (o) =>
      !storedCustomerNames.get(o.id) &&
      (o.sourceName === "erpnext" || o.sourceName === "erpnext-pos"),
  );
  const erpCustomerNames = await enrichErpOrderCustomerNames(
    erpOrdersMissingName.map((o) => ({
      id: o.id,
      sourceName: o.sourceName,
      name: o.name,
      erpnextInvoiceId: o.erpnextInvoiceId,
      shippingAddress: o.shippingAddress,
      rawPayload: o.rawPayload,
      companyLocationId: o.companyLocation.id,
    })),
  );

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
    customerName: storedCustomerNames.get(o.id) ?? erpCustomerNames.get(o.id) ?? null,
    createdAt: o.createdAt.toISOString(),
    companyLocation: o.companyLocation,
    assignedMerchant: o.assignedMerchant,
    discountCodes: o.discountCodes,
    lineItemCount: o._count.lineItems,
    printCount: o.printCount,
    lastPrintedAt: o.lastPrintedAt?.toISOString() ?? null,
    packageOnHoldAt: o.packageOnHoldAt?.toISOString() ?? null,
    sampleFreeIssueSendLaterDate: o.sampleFreeIssueSendLaterDate?.toISOString() ?? null,
    packageHoldReason: o.packageHoldReason,
    fulfillmentStage: o.fulfillmentStage,
    paymentGatewayNames: "paymentGatewayNames" in o ? o.paymentGatewayNames : [],
    paymentGatewayPrimary: "paymentGatewayPrimary" in o ? o.paymentGatewayPrimary : null,
    pendingPaymentApproval: o.approvalRequests.some((a) => a.type === ORDER_PAYMENT_APPROVAL),
    pendingDeliveryPaymentApproval: o.approvalRequests.some(
      (a) => a.type === DELIVERY_PAYMENT_APPROVAL
    ),
    merchantCouponCode: getMerchantCouponCode({
      sourceName: o.sourceName,
      discountCodes: o.discountCodes,
      rawPayload: null,
      assignedMerchantCouponCodes: o.assignedMerchant?.couponCodes ?? null,
    }),
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
