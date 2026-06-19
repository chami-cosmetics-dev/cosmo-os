import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { processOrderWebhook } from "@/lib/order-webhook-process";
import { isShopifyOrderBeforeImportCutoff } from "@/lib/order-import-cutoff";
import { shouldSkipShopifyOrderWebhookForMissingOrder } from "@/lib/shopify-order-webhook-topic";
import { shopifyOrderWebhookSchema } from "@/lib/validation/shopify-order";
import { classifyFailedWebhookError } from "@/lib/failed-order-webhook-classification";

const AUTO_RETRY_DELAYS_MS = [
  60_000,
  3 * 60_000,
  10 * 60_000,
  30 * 60_000,
] as const;
const AUTO_RETRY_BATCH_LIMIT = 10;
const AUTO_RETRY_LEASE_MS = 2 * 60_000;

type FailedWebhookWithLocation = Prisma.FailedOrderWebhookGetPayload<{
  include: {
    companyLocation: {
      include: {
        defaultMerchant: true;
        erpnextInstance: true;
      };
    };
  };
}>;

type CreateFailedOrderWebhookInput = {
  companyId: string;
  companyLocationId: string;
  shopifyOrderId: string;
  shopifyTopic?: string | null;
  errorMessage: string;
  errorStack?: string | null;
  rawPayload: object;
  scheduleAutoRetry: boolean;
};

function clampErrorMessage(message: string) {
  return message.slice(0, 10_000);
}

function clampErrorStack(stack: string | null | undefined) {
  return stack?.slice(0, 10_000) ?? null;
}

export function getNextFailedWebhookAutoRetryAt(
  autoRetryCount: number,
  from: Date = new Date()
) {
  const delayMs = AUTO_RETRY_DELAYS_MS[autoRetryCount];
  if (delayMs == null) {
    return null;
  }

  return new Date(from.getTime() + delayMs);
}

export async function createFailedOrderWebhook(input: CreateFailedOrderWebhookInput) {
  await prisma.failedOrderWebhook.create({
    data: {
      companyId: input.companyId,
      companyLocationId: input.companyLocationId,
      shopifyOrderId: input.shopifyOrderId,
      shopifyTopic: input.shopifyTopic?.slice(0, 100) ?? null,
      errorMessage: clampErrorMessage(input.errorMessage),
      errorStack: clampErrorStack(input.errorStack),
      rawPayload: input.rawPayload,
      nextAutoRetryAt: input.scheduleAutoRetry
        ? getNextFailedWebhookAutoRetryAt(0, new Date())
        : null,
    },
  });
}

async function claimDueFailedOrderWebhooks(companyId: string | null, limit: number) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + AUTO_RETRY_LEASE_MS);
  const where: Prisma.FailedOrderWebhookWhereInput = {
    resolvedAt: null,
    nextAutoRetryAt: { lte: now },
    ...(companyId ? { companyId } : {}),
    OR: [
      { retryLeaseExpiresAt: null },
      { retryLeaseExpiresAt: { lte: now } },
    ],
  };

  const candidates = await prisma.failedOrderWebhook.findMany({
    where,
    orderBy: [
      { nextAutoRetryAt: "asc" },
      { createdAt: "asc" },
    ],
    take: limit * 2,
    select: { id: true },
  });

  const claimedIds: string[] = [];

  for (const candidate of candidates) {
    const claimResult = await prisma.failedOrderWebhook.updateMany({
      where: {
        id: candidate.id,
        resolvedAt: null,
        nextAutoRetryAt: { lte: now },
        OR: [
          { retryLeaseExpiresAt: null },
          { retryLeaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        retryLeaseExpiresAt: leaseUntil,
      },
    });

    if (claimResult.count === 1) {
      claimedIds.push(candidate.id);
    }

    if (claimedIds.length >= limit) {
      break;
    }
  }

  if (claimedIds.length === 0) {
    return [] satisfies FailedWebhookWithLocation[];
  }

  return prisma.failedOrderWebhook.findMany({
    where: { id: { in: claimedIds } },
    include: {
      companyLocation: {
        include: {
          defaultMerchant: true,
          erpnextInstance: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function resolveFailedOrderWebhookRecord(
  failedWebhookId: string,
  attemptedAt: Date
) {
  await prisma.failedOrderWebhook.update({
    where: { id: failedWebhookId },
    data: {
      resolvedAt: attemptedAt,
      lastAutoRetryAt: attemptedAt,
      nextAutoRetryAt: null,
      retryLeaseExpiresAt: null,
      autoRetryCount: { increment: 1 },
    },
  });
}

async function markFailedOrderWebhookRetryError(
  failedWebhook: FailedWebhookWithLocation,
  attemptedAt: Date,
  errorMessage: string,
  errorStack: string | null,
  shouldRetryAgain: boolean
) {
  const nextCount = failedWebhook.autoRetryCount + 1;

  await prisma.failedOrderWebhook.update({
    where: { id: failedWebhook.id },
    data: {
      errorMessage: clampErrorMessage(errorMessage),
      errorStack: clampErrorStack(errorStack),
      lastAutoRetryAt: attemptedAt,
      nextAutoRetryAt: shouldRetryAgain
        ? getNextFailedWebhookAutoRetryAt(nextCount, attemptedAt)
        : null,
      retryLeaseExpiresAt: null,
      autoRetryCount: { increment: 1 },
    },
  });
}

export async function runDueFailedOrderWebhookRetries(options?: {
  companyId?: string | null;
  limit?: number;
}) {
  const claimed = await claimDueFailedOrderWebhooks(
    options?.companyId ?? null,
    Math.max(1, Math.min(options?.limit ?? AUTO_RETRY_BATCH_LIMIT, 50))
  );

  let processed = 0;
  let resolved = 0;
  let failed = 0;

  for (const item of claimed) {
    processed += 1;
    const attemptedAt = new Date();
    const rawPayload = item.rawPayload as unknown;
    const parsed = shopifyOrderWebhookSchema.safeParse(rawPayload);

    if (!parsed.success) {
      failed += 1;
      await markFailedOrderWebhookRetryError(
        item,
        attemptedAt,
        `Stored payload invalid: ${parsed.error.message}`,
        JSON.stringify(parsed.error.flatten(), null, 2),
        false
      );
      continue;
    }

    if (isShopifyOrderBeforeImportCutoff(parsed.data.created_at)) {
      await resolveFailedOrderWebhookRecord(item.id, attemptedAt);
      resolved += 1;
      continue;
    }

    const orderExists = await prisma.order.findUnique({
      where: { shopifyOrderId: String(parsed.data.id) },
      select: { id: true },
    });
    if (shouldSkipShopifyOrderWebhookForMissingOrder(item.shopifyTopic, !!orderExists)) {
      await resolveFailedOrderWebhookRecord(item.id, attemptedAt);
      resolved += 1;
      continue;
    }

    try {
      await processOrderWebhook(
        parsed.data,
        item.companyLocation,
        rawPayload,
        item.shopifyTopic
      );
      await resolveFailedOrderWebhookRecord(item.id, attemptedAt);
      resolved += 1;
    } catch (error) {
      failed += 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const classification = classifyFailedWebhookError(errorMessage);
      await markFailedOrderWebhookRetryError(
        item,
        attemptedAt,
        errorMessage,
        error instanceof Error ? error.stack ?? null : null,
        classification.retryable &&
          item.autoRetryCount + 1 < AUTO_RETRY_DELAYS_MS.length
      );
    }
  }

  return {
    processed,
    resolved,
    failed,
  };
}
