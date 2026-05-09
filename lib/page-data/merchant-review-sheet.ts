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

export async function fetchMerchantReviewSheetData(input: {
  companyId: string;
  viewerUserId: string;
  canManage: boolean;
}) {
  const startedAt = Date.now();
  const where: Prisma.OrderWhereInput = {
    companyId: input.companyId,
    OR: [
      { invoiceCompleteAt: { not: null } },
      { deliveryCompleteAt: { not: null } },
      { fulfillmentStage: "invoice_complete" as const },
      { fulfillmentStage: "delivery_complete" as const },
    ],
  };
  where.assignedMerchantId = input.canManage ? { not: null } : input.viewerUserId;

  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 150,
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

  maybeLogSlowDbRequest("merchant_reviews.page_data", startedAt, {
    companyId: input.companyId,
    viewerUserId: input.viewerUserId,
    total: items.length,
  });

  return { orders: items, counts } satisfies MerchantReviewSheetData;
}
