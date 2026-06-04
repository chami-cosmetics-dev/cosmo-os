import type { Prisma } from "@prisma/client";

import { maybeLogSlowDbRequest } from "@/lib/dbObservability";
import { listMerchantOrderReviewsByOrderIds } from "@/lib/merchant-order-reviews";
import { prisma } from "@/lib/prisma";

export type MerchantReviewQueueItem = {
  orderId: string;
  orderLabel: string;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  totalPrice: string;
  currency: string | null;
  createdAt: string;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  reviewStatus: "pending" | "reviewed" | "follow_up" | "no_response";
  customerRating: number | null;
  reviewMarkedAt: string | null;
};

export type MerchantReviewSheetData = {
  orders: MerchantReviewQueueItem[];
  counts: {
    all: number;
    pending: number;
    reviewed: number;
    followUp: number;
    noResponse: number;
  };
  returns: MerchantReturnQueueItem[];
  returnCounts: {
    all: number;
    pending: number;
    solved: number;
  };
};

export type MerchantReturnQueueItem = {
  id: string;
  orderId: string;
  invoiceNo: string;
  merchant: { id: string; name: string | null; email: string | null } | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingService: string;
  dispatchedAt: string;
  returnDate: string;
  dayCount: number;
  actionDate: string | null;
  actionRemark: string | null;
  actionStatus: "pending" | "solved";
};

function pickCustomerName(order: {
  customer?: { firstName: string | null; lastName: string | null } | null;
  shippingAddress: unknown;
  name: string | null;
}) {
  if (order.customer?.firstName || order.customer?.lastName) {
    return [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim();
  }
  if (order.shippingAddress && typeof order.shippingAddress === "object") {
    const shipping = order.shippingAddress as Record<string, unknown>;
    const raw = shipping.name ?? [shipping.first_name, shipping.last_name].filter(Boolean).join(" ").trim();
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return order.name;
}

function isMissingOrderReturnTableError(error: unknown) {
  const meta = error && typeof error === "object" && "meta" in error
    ? (error as { meta?: { modelName?: unknown; table?: unknown } }).meta
    : null;
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2021" &&
      (meta?.modelName === "OrderReturn" || String(meta?.table ?? "").includes("OrderReturn"))
  );
}

async function listReturnedOrders(input: {
  companyId: string;
  viewerUserId: string;
  canManage: boolean;
}) {
  try {
    return await prisma.orderReturn.findMany({
      where: {
        companyId: input.companyId,
        ...(input.canManage ? {} : { merchantUserId: input.viewerUserId }),
      },
      orderBy: [{ returnDate: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        orderId: true,
        dispatchedAt: true,
        returnDate: true,
        shippingServiceName: true,
        actionStatus: true,
        actionRemark: true,
        actionDate: true,
        merchantUser: { select: { id: true, name: true, email: true } },
        order: {
          select: {
            orderNumber: true,
            name: true,
            shopifyOrderId: true,
            customerEmail: true,
            customerPhone: true,
            shippingAddress: true,
            customer: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  } catch (error) {
    if (isMissingOrderReturnTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function fetchMerchantReviewSheetData(input: {
  companyId: string;
  viewerUserId: string;
  canManage: boolean;
}) {
  const startedAt = Date.now();
  const where: Prisma.OrderWhereInput = {
    companyId: input.companyId,
    sourceName: { not: "erpnext-pos" },
  };

  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      orderNumber: true,
      name: true,
      totalPrice: true,
      currency: true,
      createdAt: true,
      customerEmail: true,
      customerPhone: true,
      shippingAddress: true,
      assignedMerchant: { select: { id: true, name: true, email: true } },
      customer: { select: { firstName: true, lastName: true } },
    },
  });

  const reviews = await listMerchantOrderReviewsByOrderIds(orders.map((order) => order.id));
  const returns = await listReturnedOrders(input);

  const items: MerchantReviewQueueItem[] = orders.map((order) => {
    const review = reviews.get(order.id);
    return {
      orderId: order.id,
      orderLabel: order.name ?? order.orderNumber ?? order.id,
      orderNumber: order.orderNumber,
      customerName: pickCustomerName(order),
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      totalPrice: order.totalPrice.toString(),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      assignedMerchant: order.assignedMerchant,
      reviewStatus: review?.reviewStatus ?? "pending",
      customerRating: review?.customerRating ?? null,
      reviewMarkedAt: review?.reviewMarkedAt?.toISOString() ?? null,
    };
  });

  const counts = items.reduce(
    (acc, item) => {
      acc.all += 1;
      if (item.reviewStatus === "reviewed") acc.reviewed += 1;
      else if (item.reviewStatus === "follow_up") acc.followUp += 1;
      else if (item.reviewStatus === "no_response") acc.noResponse += 1;
      else acc.pending += 1;
      return acc;
    },
    { all: 0, pending: 0, reviewed: 0, followUp: 0, noResponse: 0 }
  );

  const returnItems: MerchantReturnQueueItem[] = returns.map((item) => ({
    id: item.id,
    orderId: item.orderId,
    invoiceNo: item.order.orderNumber ?? item.order.name ?? item.order.shopifyOrderId,
    merchant: item.merchantUser,
    customerName: pickCustomerName({
      customer: item.order.customer,
      shippingAddress: item.order.shippingAddress,
      name: item.order.name,
    }),
    customerEmail: item.order.customerEmail,
    customerPhone: item.order.customerPhone,
    shippingService: item.shippingServiceName,
    dispatchedAt: item.dispatchedAt.toISOString(),
    returnDate: item.returnDate.toISOString(),
    dayCount: Math.max(0, Math.ceil((item.returnDate.getTime() - item.dispatchedAt.getTime()) / 86_400_000)),
    actionDate: item.actionDate?.toISOString() ?? null,
    actionRemark: item.actionRemark,
    actionStatus: item.actionStatus,
  }));

  const returnCounts = returnItems.reduce(
    (acc, item) => {
      acc.all += 1;
      if (item.actionStatus === "solved") acc.solved += 1;
      else acc.pending += 1;
      return acc;
    },
    { all: 0, pending: 0, solved: 0 }
  );

  maybeLogSlowDbRequest("merchant_reviews.page_data", startedAt, {
    companyId: input.companyId,
    viewerUserId: input.viewerUserId,
    total: items.length,
  });

  return { orders: items, counts, returns: returnItems, returnCounts } satisfies MerchantReviewSheetData;
}
