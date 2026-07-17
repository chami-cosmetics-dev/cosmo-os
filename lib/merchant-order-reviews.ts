import { prisma } from "@/lib/prisma";

export type MerchantReviewStatus = "pending" | "reviewed" | "follow_up" | "no_response";

export type MerchantOrderReviewRecord = {
  id: string;
  companyId: string;
  orderId: string;
  merchantUserId: string | null;
  reviewStatus: MerchantReviewStatus;
  customerRating: number | null;
  customerFeedback: string | null;
  itemFeedback: string | null;
  merchantNotes: string | null;
  followUpNeeded: boolean;
  callMade: boolean;
  callbackDate: Date | null;
  customerResponseStatus: string | null;
  reviewerFirstName: string | null;
  reviewerLastName: string | null;
  reviewerEmail: string | null;
  reason: string | null;
  reviewMarkedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MerchantOrderReviewModel = {
  findMany: (args: unknown) => Promise<MerchantOrderReviewRecord[]>;
  findFirst: (args: unknown) => Promise<MerchantOrderReviewRecord | null>;
  upsert: (args: unknown) => Promise<MerchantOrderReviewRecord>;
};

function getMerchantOrderReviewModel(): MerchantOrderReviewModel | null {
  const model = (prisma as unknown as { merchantOrderReview?: MerchantOrderReviewModel }).merchantOrderReview;
  return model ?? null;
}

export function supportsMerchantOrderReviews() {
  return !!getMerchantOrderReviewModel();
}

export async function listMerchantOrderReviewsByOrderIds(orderIds: string[]) {
  const model = getMerchantOrderReviewModel();
  if (!model || orderIds.length === 0) {
    return new Map<string, MerchantOrderReviewRecord>();
  }

  const rows = await model.findMany({
    where: { orderId: { in: orderIds } },
  });

  return new Map(rows.map((row) => [row.orderId, row]));
}

export async function getMerchantOrderReview(orderId: string) {
  const model = getMerchantOrderReviewModel();
  if (!model) return null;

  return model.findFirst({
    where: { orderId },
  });
}

export async function saveMerchantOrderReview(input: {
  companyId: string;
  orderId: string;
  merchantUserId: string | null;
  reviewStatus: MerchantReviewStatus;
  customerRating: number | null;
  customerFeedback: string | null;
  itemFeedback: string | null;
  merchantNotes: string | null;
  followUpNeeded: boolean;
  callMade: boolean;
  callbackDate: Date | null;
  customerResponseStatus: string | null;
  reviewerFirstName: string | null;
  reviewerLastName: string | null;
  reviewerEmail: string | null;
  reason: string | null;
  reviewMarkedAt: Date | null;
}) {
  const model = getMerchantOrderReviewModel();
  if (!model) {
    throw new Error("Merchant review table is not available yet. Run the latest Prisma migration first.");
  }

  return model.upsert({
    where: { orderId: input.orderId },
    create: input,
    update: {
      merchantUserId: input.merchantUserId,
      reviewStatus: input.reviewStatus,
      customerRating: input.customerRating,
      customerFeedback: input.customerFeedback,
      itemFeedback: input.itemFeedback,
      merchantNotes: input.merchantNotes,
      followUpNeeded: input.followUpNeeded,
      callMade: input.callMade,
      callbackDate: input.callbackDate,
      customerResponseStatus: input.customerResponseStatus,
      reviewerFirstName: input.reviewerFirstName,
      reviewerLastName: input.reviewerLastName,
      reviewerEmail: input.reviewerEmail,
      reason: input.reason,
      reviewMarkedAt: input.reviewMarkedAt,
    },
  });
}

export type MarkFollowUpCounts = {
  requested: number;
  updated: number;
  alreadyFollowUp: number;
  terminalStatus: number;
  notFound: number;
};

const TERMINAL_REVIEW_STATUSES = new Set<MerchantReviewStatus>(["reviewed", "no_response"]);

/**
 * Bulk-set reviewStatus to follow_up for company-scoped orders.
 * Skips reviewed/no_response; treats existing follow_up as idempotent.
 * Creates a review row when missing (implicit pending).
 * Does not clear call/reason fields on update — only sets reviewStatus (+ merchantUserId when creating).
 */
export async function markManyMerchantReviewsFollowUp(input: {
  companyId: string;
  orderIds: string[];
  actorUserId: string;
}): Promise<{ updatedOrderIds: string[]; counts: MarkFollowUpCounts }> {
  const model = getMerchantOrderReviewModel();
  if (!model) {
    throw new Error("Merchant review table is not available yet. Run the latest Prisma migration first.");
  }

  const uniqueIds = Array.from(new Set(input.orderIds));
  const counts: MarkFollowUpCounts = {
    requested: uniqueIds.length,
    updated: 0,
    alreadyFollowUp: 0,
    terminalStatus: 0,
    notFound: 0,
  };

  if (uniqueIds.length === 0) {
    return { updatedOrderIds: [], counts };
  }

  const orders = await prisma.order.findMany({
    where: {
      id: { in: uniqueIds },
      companyId: input.companyId,
    },
    select: {
      id: true,
      companyId: true,
      assignedMerchantId: true,
    },
  });

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const reviews = await listMerchantOrderReviewsByOrderIds(orders.map((order) => order.id));
  const updatedOrderIds: string[] = [];

  for (const orderId of uniqueIds) {
    const order = orderById.get(orderId);
    if (!order) {
      counts.notFound += 1;
      continue;
    }

    const existing = reviews.get(orderId);
    const status = (existing?.reviewStatus ?? "pending") as MerchantReviewStatus;

    if (TERMINAL_REVIEW_STATUSES.has(status)) {
      counts.terminalStatus += 1;
      continue;
    }

    if (status === "follow_up") {
      counts.alreadyFollowUp += 1;
      continue;
    }

    await model.upsert({
      where: { orderId },
      create: {
        companyId: order.companyId,
        orderId,
        merchantUserId: order.assignedMerchantId ?? input.actorUserId,
        reviewStatus: "follow_up",
        customerRating: null,
        customerFeedback: null,
        itemFeedback: null,
        merchantNotes: null,
        followUpNeeded: false,
        callMade: false,
        callbackDate: null,
        customerResponseStatus: null,
        reviewerFirstName: null,
        reviewerLastName: null,
        reviewerEmail: null,
        reason: null,
        reviewMarkedAt: null,
      },
      update: {
        reviewStatus: "follow_up",
      },
    });

    updatedOrderIds.push(orderId);
    counts.updated += 1;
  }

  return { updatedOrderIds, counts };
}
