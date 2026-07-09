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
