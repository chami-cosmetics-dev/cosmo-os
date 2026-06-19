import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ORDER_PAYMENT_APPROVAL } from "@/lib/approval-workflow";
import { syncOrderToERPNext, syncOrderToERPNextFromOrder, syncFinanceApprovedPrepaidPaymentToERPNext } from "@/lib/erpnext-sync";
import { shopifyOrderWebhookSchema } from "@/lib/validation/shopify-order";
import { classifyFailedErpSyncError } from "@/lib/failed-erp-sync-classification";
import {
  getOrderImportCutoff,
  isOrderBeforeImportCutoff,
} from "@/lib/order-import-cutoff";
import {
  getErpShopifySyncSkipReason,
  shouldSkipShopifyOrderErpSync,
} from "@/lib/erp-shopify-sync-eligibility";

const AUTO_RETRY_DELAYS_MS = [
  60_000,
  3 * 60_000,
  10 * 60_000,
  30 * 60_000,
] as const;
const AUTO_RETRY_BATCH_LIMIT = 10;
const AUTO_RETRY_LEASE_MS = 2 * 60_000;

/** Order ERP auto-retry columns — explicit so typings stay valid before `prisma generate`. */
type OrderErpSyncRetryPatch = {
  erpnextSyncError?: string | null;
  erpnextSyncFailedAt?: Date | null;
  erpnextSyncAutoRetryCount?: number;
  erpnextSyncLastAutoRetryAt?: Date | null | undefined;
  erpnextSyncNextAutoRetryAt?: Date | null;
  erpnextSyncRetryLeaseExpiresAt?: Date | null;
  erpnextInvoiceId?: string | null;
};

function orderUpdate(patch: OrderErpSyncRetryPatch): Prisma.OrderUpdateInput {
  return patch as Prisma.OrderUpdateInput;
}

function orderUpdateMany(patch: OrderErpSyncRetryPatch): Prisma.OrderUpdateManyMutationInput {
  return patch as Prisma.OrderUpdateManyMutationInput;
}

function orderWhere(patch: Record<string, unknown>): Prisma.OrderWhereInput {
  return patch as Prisma.OrderWhereInput;
}

function orderOrderBy(patch: Record<string, unknown>): Prisma.OrderOrderByWithRelationInput {
  return patch as Prisma.OrderOrderByWithRelationInput;
}

export const ERP_SYNC_SUCCESS_CLEAR = {
  erpnextSyncError: null,
  erpnextSyncFailedAt: null,
  erpnextSyncAutoRetryCount: 0,
  erpnextSyncLastAutoRetryAt: null,
  erpnextSyncNextAutoRetryAt: null,
  erpnextSyncRetryLeaseExpiresAt: null,
} as const;

export type OrderForErpRetry = Prisma.OrderGetPayload<{
  include: {
    companyLocation: { include: { erpnextInstance: true } };
    lineItems: { include: { productItem: true } };
  };
}>;

function clampErrorMessage(message: string) {
  return message.slice(0, 10_000);
}

async function getOrderErpSyncAutoRetryCount(orderId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ erpnextSyncAutoRetryCount: number }>>(
    Prisma.sql`
      SELECT COALESCE("erpnextSyncAutoRetryCount", 0) AS "erpnextSyncAutoRetryCount"
      FROM "Order"
      WHERE "id" = ${orderId}
      LIMIT 1
    `
  );
  return Number(rows[0]?.erpnextSyncAutoRetryCount ?? 0);
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

export function isPlaceholderErpInvoiceId(id: string | null | undefined) {
  return !id || id === "pending" || id === "pending_approval";
}

export function buildFailedErpSyncWhere(companyId?: string, search?: string): Prisma.OrderWhereInput {
  const cutoff = getOrderImportCutoff();
  const base: Prisma.OrderWhereInput = {
    ...(companyId ? { companyId } : {}),
    ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
    financialStatus: { not: "voided" },
    erpnextSyncError: { not: null },
    OR: [
      { erpnextInvoiceId: null },
      { erpnextInvoiceId: "pending" },
      { erpnextInvoiceId: "pending_approval" },
    ],
  };

  const term = search?.trim();
  if (!term) {
    return base;
  }

  return {
    AND: [
      base,
      {
        OR: [
          { orderNumber: { endsWith: term, mode: "insensitive" } },
          { name: { endsWith: term, mode: "insensitive" } },
          { erpnextInvoiceId: { endsWith: term, mode: "insensitive" } },
          { shopifyOrderId: { contains: term, mode: "insensitive" } },
          { customerEmail: { contains: term, mode: "insensitive" } },
          { customerPhone: { contains: term, mode: "insensitive" } },
          { erpnextSyncError: { contains: term, mode: "insensitive" } },
        ],
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
    /** When true, loads current count from DB and increments (manual / batch retry failures). */
    incrementAutoRetryCount?: boolean;
    attemptedAt?: Date;
  }
) {
  const attemptedAt = options?.attemptedAt ?? new Date();
  let autoRetryCount = options?.autoRetryCount;
  if (autoRetryCount === undefined) {
    autoRetryCount = await getOrderErpSyncAutoRetryCount(orderId);
    if (options?.incrementAutoRetryCount) {
      autoRetryCount += 1;
    }
  }
  const classification = classifyFailedErpSyncError(errorMessage);
  const shouldSchedule =
    (options?.scheduleAutoRetry ?? true) &&
    classification.retryable &&
    autoRetryCount < AUTO_RETRY_DELAYS_MS.length;

  await prisma.order.update({
    where: { id: orderId },
    data: orderUpdate({
      erpnextSyncError: clampErrorMessage(errorMessage),
      erpnextSyncFailedAt: attemptedAt,
      erpnextSyncLastAutoRetryAt: autoRetryCount > 0 ? attemptedAt : undefined,
      erpnextSyncNextAutoRetryAt: shouldSchedule
        ? getNextFailedErpSyncAutoRetryAt(autoRetryCount, attemptedAt)
        : null,
      erpnextSyncRetryLeaseExpiresAt: null,
      erpnextSyncAutoRetryCount: autoRetryCount,
    }),
  });
}

export async function retryOrderErpSync(order: OrderForErpRetry): Promise<void> {
  if (order.financialStatus?.toLowerCase() === "voided") {
    await prisma.order.update({
      where: { id: order.id },
      data: orderUpdate(ERP_SYNC_SUCCESS_CLEAR),
    });
    console.warn("[ERPNext] Skipping retry for voided order", {
      orderId: order.id,
    });
    return;
  }

  const skipReason = getErpShopifySyncSkipReason(order.createdAt, order.companyLocation);
  if (skipReason) {
    await prisma.order.update({
      where: { id: order.id },
      data: orderUpdate({
        ...ERP_SYNC_SUCCESS_CLEAR,
        erpnextInvoiceId:
          order.erpnextInvoiceId === "pending" || order.erpnextInvoiceId === "pending_approval"
            ? null
            : order.erpnextInvoiceId,
      }),
    });
    console.warn("[ERPNext] Skipping retry for order excluded from Shopify → ERP sync", {
      orderId: order.id,
      createdAt: order.createdAt.toISOString(),
      reason: skipReason ?? "import_cutoff",
    });
    return;
  }

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
    } else {
      console.warn("[ERPNext] retry: rawPayload schema validation failed — falling back to Vault OS data");
      await syncOrderToERPNextFromOrder({ ...order, companyLocation: order.companyLocation });
    }
  } else {
    await syncOrderToERPNextFromOrder({ ...order, companyLocation: order.companyLocation });
  }

  await assertOrderHasErpSalesInvoice(order.id);
}

async function assertOrderHasErpSalesInvoice(orderId: string) {
  const after = await prisma.order.findUnique({
    where: { id: orderId },
    select: { erpnextInvoiceId: true },
  });
  if (isPlaceholderErpInvoiceId(after?.erpnextInvoiceId)) {
    throw new Error(
      "ERP Sales Invoice was not created. Check ERP credentials, warehouse, and line items on the location."
    );
  }
}

/** Run ERP sync after finance approves a Koko/bank-transfer order. */
export async function runPostApprovalErpSync(orderId: string, paidAt: Date = new Date()): Promise<void> {
  const orderBefore = await prisma.order.findUnique({
    where: { id: orderId },
    select: { erpnextInvoiceId: true, createdAt: true, companyLocationId: true },
  });
  const hadExistingSi = orderBefore && !isPlaceholderErpInvoiceId(orderBefore.erpnextInvoiceId);

  if (!hadExistingSi) {
    const orderForSkipCheck = await prisma.order.findUnique({
      where: { id: orderId },
      include: { companyLocation: { include: { erpnextInstance: true } } },
    });
    if (!orderForSkipCheck?.companyLocation) {
      throw new Error("Order or company location not found");
    }

    if (shouldSkipShopifyOrderErpSync(orderForSkipCheck.createdAt, orderForSkipCheck.companyLocation)) {
      await prisma.order.updateMany({
        where: {
          id: orderId,
          erpnextInvoiceId: "pending_approval",
        },
        data: orderUpdateMany({ erpnextInvoiceId: null }),
      });
      return;
    }

    await prisma.order.updateMany({
      where: {
        id: orderId,
        OR: [{ erpnextInvoiceId: null }, { erpnextInvoiceId: "pending_approval" }],
      },
      data: orderUpdateMany({
        erpnextInvoiceId: "pending",
        erpnextSyncError: null,
        erpnextSyncFailedAt: null,
        erpnextSyncNextAutoRetryAt: null,
        erpnextSyncRetryLeaseExpiresAt: null,
      }),
    });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        companyLocation: { include: { erpnextInstance: true } },
        lineItems: { include: { productItem: true } },
      },
    });
    if (!order?.companyLocation) {
      throw new Error("Order or company location not found");
    }

    await retryOrderErpSync(order);
  }

  const orderAfter = await prisma.order.findUnique({
    where: { id: orderId },
    include: { companyLocation: { include: { erpnextInstance: true } } },
  });
  if (!orderAfter?.companyLocation) {
    throw new Error("Order or company location not found");
  }

  await syncFinanceApprovedPrepaidPaymentToERPNext(orderAfter, orderAfter.companyLocation, paidAt);
}

async function claimDueFailedErpSyncs(companyId: string | null, limit: number) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + AUTO_RETRY_LEASE_MS);
  const where: Prisma.OrderWhereInput = {
    AND: [
      buildFailedErpSyncWhere(companyId ?? undefined),
      orderWhere({ erpnextSyncNextAutoRetryAt: { lte: now } }),
      orderWhere({
        OR: [
          { erpnextSyncRetryLeaseExpiresAt: null },
          { erpnextSyncRetryLeaseExpiresAt: { lte: now } },
        ],
      }),
    ],
  };

  const candidates = await prisma.order.findMany({
    where,
    orderBy: [
      orderOrderBy({ erpnextSyncNextAutoRetryAt: "asc" }),
      orderOrderBy({ erpnextSyncFailedAt: "asc" }),
    ],
    take: limit * 2,
    select: { id: true },
  });

  const claimedIds: string[] = [];

  for (const candidate of candidates) {
    const claimResult = await prisma.order.updateMany({
      where: orderWhere({
        id: candidate.id,
        erpnextSyncNextAutoRetryAt: { lte: now },
        OR: [
          { erpnextSyncRetryLeaseExpiresAt: null },
          { erpnextSyncRetryLeaseExpiresAt: { lte: now } },
        ],
      }),
      data: orderUpdateMany({ erpnextSyncRetryLeaseExpiresAt: leaseUntil }),
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
    data: orderUpdate({ erpnextSyncRetryLeaseExpiresAt: null }),
  });
}

export async function scheduleUnscheduledFailedErpSyncs(
  companyId: string,
  limit = 50
) {
  const orders = await prisma.order.findMany({
    where: orderWhere({
      AND: [
        buildFailedErpSyncWhere(companyId),
        { erpnextSyncNextAutoRetryAt: null },
      ],
    }),
    take: limit,
    select: {
      id: true,
      erpnextSyncError: true,
      erpnextInvoiceId: true,
    },
  });

  for (const order of orders) {
    const errorText = order.erpnextSyncError ?? "";
    if (!errorText) continue;
    const classification = classifyFailedErpSyncError(errorText);
    if (!classification.retryable) continue;

    const autoRetryCount = await getOrderErpSyncAutoRetryCount(order.id);
    await prisma.order.update({
      where: { id: order.id },
      data: orderUpdate({
        erpnextSyncNextAutoRetryAt: getNextFailedErpSyncAutoRetryAt(autoRetryCount),
      }),
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
      const nextCount = (await getOrderErpSyncAutoRetryCount(order.id)) + 1;

      await prisma.order.update({
        where: { id: order.id },
        data: orderUpdate({
          erpnextSyncError: clampErrorMessage(errorMessage),
          erpnextSyncFailedAt: attemptedAt,
          erpnextSyncLastAutoRetryAt: attemptedAt,
          erpnextSyncNextAutoRetryAt:
            classification.retryable && nextCount < AUTO_RETRY_DELAYS_MS.length
              ? getNextFailedErpSyncAutoRetryAt(nextCount, attemptedAt)
              : null,
          erpnextSyncRetryLeaseExpiresAt: null,
          erpnextSyncAutoRetryCount: nextCount,
        }),
      });
    }
  }

  return {
    processed,
    resolved,
    failed,
  };
}
