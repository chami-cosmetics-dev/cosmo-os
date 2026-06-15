import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ORDER_PAYMENT_APPROVAL } from "@/lib/approval-workflow";
import { syncOrderToERPNext, syncOrderToERPNextFromOrder } from "@/lib/erpnext-sync";
import { shopifyOrderWebhookSchema } from "@/lib/validation/shopify-order";
import { classifyFailedErpSyncError } from "@/lib/failed-erp-sync-classification";

const AUTO_RETRY_DELAYS_MS = [
  60_000,
  3 * 60_000,
  10 * 60_000,
  30 * 60_000,
] as const;
const AUTO_RETRY_BATCH_LIMIT = 10;
const AUTO_RETRY_LEASE_MS = 2 * 60_000;

export const ERP_SYNC_SUCCESS_CLEAR = {
  erpnextSyncError: null,
  erpnextSyncFailedAt: null,
  erpnextSyncAutoRetryCount: 0,
  erpnextSyncLastAutoRetryAt: null,
  erpnextSyncNextAutoRetryAt: null,
  erpnextSyncRetryLeaseExpiresAt: null,
} as const;

type OrderForErpRetry = Prisma.OrderGetPayload<{
  include: {
    companyLocation: { include: { erpnextInstance: true } };
    lineItems: { include: { productItem: true } };
  };
}>;

function clampErrorMessage(message: string) {
  return message.slice(0, 10_000);
}

export function getNextFailedErpSyncAutoRetryAt(
  autoRetryCount: number,
  from: Date = new Date()
) {
  const delayMs = AUTO_RETRY_DELAYS_MS[autoRetryCount];
  if (delayMs == null) {
    return null;
  }

  return new Date(from.getTime() + delayMs);
}

export function buildFailedErpSyncWhere(companyId?: string): Prisma.OrderWhereInput {
  return {
    ...(companyId ? { companyId } : {}),
    OR: [
      { erpnextSyncError: { not: null }, erpnextInvoiceId: null },
      {
        erpnextInvoiceId: "pending_approval",
        approvalRequests: { none: { type: ORDER_PAYMENT_APPROVAL, status: "pending" } },
      },
    ],
  };
}

export async function markOrderErpSyncFailed(
  orderId: string,
  errorMessage: string,
  options?: {
    scheduleAutoRetry?: boolean;
    autoRetryCount?: number;
    attemptedAt?: Date;
  }
) {
  const attemptedAt = options?.attemptedAt ?? new Date();
  const autoRetryCount = options?.autoRetryCount ?? 0;
  const classification = classifyFailedErpSyncError(errorMessage);
  const shouldSchedule =
    (options?.scheduleAutoRetry ?? true) &&
    classification.retryable &&
    autoRetryCount < AUTO_RETRY_DELAYS_MS.length;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      erpnextSyncError: clampErrorMessage(errorMessage),
      erpnextSyncFailedAt: attemptedAt,
      erpnextSyncLastAutoRetryAt: autoRetryCount > 0 ? attemptedAt : undefined,
      erpnextSyncNextAutoRetryAt: shouldSchedule
        ? getNextFailedErpSyncAutoRetryAt(autoRetryCount, attemptedAt)
        : null,
      erpnextSyncRetryLeaseExpiresAt: null,
      erpnextSyncAutoRetryCount: autoRetryCount,
    },
  });
}

export async function retryOrderErpSync(order: OrderForErpRetry): Promise<void> {
  if (order.erpnextInvoiceId === "pending_approval") {
    const pendingApproval = await prisma.approvalRequest.findFirst({
      where: { orderId: order.id, type: ORDER_PAYMENT_APPROVAL, status: "pending" },
      select: { id: true },
    });
    if (pendingApproval) {
      throw new Error(
        "This order is awaiting finance approval. The ERP invoice will be created automatically once approved."
      );
    }
  }

  if (order.rawPayload) {
    const parsed = shopifyOrderWebhookSchema.safeParse(order.rawPayload);
    if (parsed.success) {
      await syncOrderToERPNext(order, order.companyLocation, parsed.data);
      return;
    }
    console.warn("[ERPNext] retry: rawPayload schema validation failed — falling back to Vault OS data");
  }

  await syncOrderToERPNextFromOrder({ ...order, companyLocation: order.companyLocation });
}

async function claimDueFailedErpSyncs(companyId: string | null, limit: number) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + AUTO_RETRY_LEASE_MS);
  const where: Prisma.OrderWhereInput = {
    AND: [
      buildFailedErpSyncWhere(companyId ?? undefined),
      { erpnextSyncNextAutoRetryAt: { lte: now } },
      {
        OR: [
          { erpnextSyncRetryLeaseExpiresAt: null },
          { erpnextSyncRetryLeaseExpiresAt: { lte: now } },
        ],
      },
    ],
  };

  const candidates = await prisma.order.findMany({
    where,
    orderBy: [
      { erpnextSyncNextAutoRetryAt: "asc" },
      { erpnextSyncFailedAt: "asc" },
    ],
    take: limit * 2,
    select: { id: true },
  });

  const claimedIds: string[] = [];

  for (const candidate of candidates) {
    const claimResult = await prisma.order.updateMany({
      where: {
        id: candidate.id,
        erpnextSyncNextAutoRetryAt: { lte: now },
        OR: [
          { erpnextSyncRetryLeaseExpiresAt: null },
          { erpnextSyncRetryLeaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        erpnextSyncRetryLeaseExpiresAt: leaseUntil,
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
    return [] satisfies OrderForErpRetry[];
  }

  return prisma.order.findMany({
    where: { id: { in: claimedIds } },
    include: {
      companyLocation: { include: { erpnextInstance: true } },
      lineItems: { include: { productItem: true } },
    },
    orderBy: { erpnextSyncFailedAt: "asc" },
  });
}

async function clearOrderErpSyncRetryLease(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { erpnextSyncRetryLeaseExpiresAt: null },
  });
}

export async function scheduleUnscheduledFailedErpSyncs(
  companyId: string,
  limit = 50
) {
  const orders = await prisma.order.findMany({
    where: {
      AND: [
        buildFailedErpSyncWhere(companyId),
        { erpnextSyncNextAutoRetryAt: null },
      ],
    },
    take: limit,
    select: {
      id: true,
      erpnextSyncError: true,
      erpnextSyncAutoRetryCount: true,
      erpnextInvoiceId: true,
    },
  });

  for (const order of orders) {
    const errorText =
      order.erpnextSyncError ??
      (order.erpnextInvoiceId === "pending_approval"
        ? "Payment was approved but ERP sync was not triggered."
        : "");
    const classification = classifyFailedErpSyncError(errorText);
    if (!classification.retryable) continue;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        erpnextSyncNextAutoRetryAt: getNextFailedErpSyncAutoRetryAt(
          order.erpnextSyncAutoRetryCount
        ),
      },
    });
  }
}

export async function runDueFailedErpSyncRetries(options?: {
  companyId?: string | null;
  limit?: number;
}) {
  const claimed = await claimDueFailedErpSyncs(
    options?.companyId ?? null,
    Math.max(1, Math.min(options?.limit ?? AUTO_RETRY_BATCH_LIMIT, 50))
  );

  let processed = 0;
  let resolved = 0;
  let failed = 0;

  for (const order of claimed) {
    processed += 1;
    const attemptedAt = new Date();

    try {
      await retryOrderErpSync(order);
      await clearOrderErpSyncRetryLease(order.id);
      resolved += 1;
    } catch (error) {
      failed += 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const classification = classifyFailedErpSyncError(errorMessage);
      const nextCount = order.erpnextSyncAutoRetryCount + 1;

      await prisma.order.update({
        where: { id: order.id },
        data: {
          erpnextSyncError: clampErrorMessage(errorMessage),
          erpnextSyncFailedAt: attemptedAt,
          erpnextSyncLastAutoRetryAt: attemptedAt,
          erpnextSyncNextAutoRetryAt:
            classification.retryable && nextCount < AUTO_RETRY_DELAYS_MS.length
              ? getNextFailedErpSyncAutoRetryAt(nextCount, attemptedAt)
              : null,
          erpnextSyncRetryLeaseExpiresAt: null,
          erpnextSyncAutoRetryCount: nextCount,
        },
      });
    }
  }

  return {
    processed,
    resolved,
    failed,
  };
}
