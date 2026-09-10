import { Prisma } from "@prisma/client";

import {
  FINANCE_PENDING_FULFILLMENT_EXCLUSION,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import {
  classifyFailedErpSyncError,
  formatFailedErpSyncErrorMessage,
} from "@/lib/failed-erp-sync-classification";
import { markOrderFinanciallyInvoiceComplete } from "@/lib/financial-invoice-complete";
import {
  syncOrderDeliveryPaymentEntriesToErp,
  getErpConfig,
  resolveOrderPaymentMop,
} from "@/lib/erpnext-sync";
import { prisma } from "@/lib/prisma";

const PE_AUTO_RETRY_DELAYS_MS = [
  60_000,
  3 * 60_000,
  10 * 60_000,
  30 * 60_000,
] as const;
const PE_AUTO_RETRY_BATCH_LIMIT = 10;
const PE_AUTO_RETRY_LEASE_MS = 2 * 60_000;

type OrderErpPeSyncRetryPatch = {
  erpPeSyncError?: string | null;
  erpPeSyncFailedAt?: Date | null;
  erpPeSyncMop?: string | null;
  erpPeSyncAutoRetryCount?: number;
  erpPeSyncLastAutoRetryAt?: Date | null;
  erpPeSyncNextAutoRetryAt?: Date | null;
  erpPeSyncRetryLeaseExpiresAt?: Date | null;
};

function orderPeUpdate(patch: OrderErpPeSyncRetryPatch): Prisma.OrderUpdateInput {
  return patch as Prisma.OrderUpdateInput;
}

function orderPeUpdateMany(patch: OrderErpPeSyncRetryPatch): Prisma.OrderUpdateManyMutationInput {
  return patch as Prisma.OrderUpdateManyMutationInput;
}

function orderPeWhere(patch: Record<string, unknown>): Prisma.OrderWhereInput {
  return patch as Prisma.OrderWhereInput;
}

function orderPeOrderBy(patch: Record<string, unknown>): Prisma.OrderOrderByWithRelationInput {
  return patch as Prisma.OrderOrderByWithRelationInput;
}

export const ERP_PE_SYNC_SUCCESS_CLEAR = {
  erpPeSyncError: null,
  erpPeSyncFailedAt: null,
  erpPeSyncMop: null,
  erpPeSyncAutoRetryCount: 0,
  erpPeSyncLastAutoRetryAt: null,
  erpPeSyncNextAutoRetryAt: null,
  erpPeSyncRetryLeaseExpiresAt: null,
} as const;

export function getNextFailedErpPeSyncAutoRetryAt(
  autoRetryCount: number,
  from: Date = new Date(),
) {
  const delayMs = PE_AUTO_RETRY_DELAYS_MS[autoRetryCount];
  if (delayMs == null) return null;
  return new Date(from.getTime() + delayMs);
}

/** Stored when invoice-complete used order payment gateways (legacy label). */
export const ERP_PE_SYNC_MOP_ORDER_AUTO = "order payment mode";

export const PENDING_FINANCE_APPROVAL_PE_RETRY_ERROR =
  "Payment entry is awaiting finance approval. Invoice complete is set when finance approves.";

export const SPLIT_PAYMENT_FINANCE_APPROVAL_PE_RETRY_ERROR =
  "Split payment retry must be approved again from Finance Approvals so each payment method keeps its correct amount";

export function isPendingFinanceApprovalPeRetryError(message: string): boolean {
  return classifyFailedErpSyncError(message).type === "Pending approval";
}

export const ERP_PE_GAP_ERROR_PREFIX = "PE missing";

function clampErrorMessage(message: string) {
  return formatFailedErpSyncErrorMessage(message).slice(0, 10_000);
}

/** PE failures on terminal invoice-complete or early financial completion / settlement attempts. */
export function buildFailedErpPeSyncWhere(companyId?: string, search?: string): Prisma.OrderWhereInput {
  const base: Prisma.OrderWhereInput = {
    ...(companyId ? { companyId } : {}),
    financialStatus: { not: "voided" },
    erpPeSyncError: { not: null },
    ...FINANCE_PENDING_FULFILLMENT_EXCLUSION,
    OR: [
      { fulfillmentStage: "invoice_complete" },
      { invoiceCompleteAt: { not: null } },
      // Delivery-approval / CC Checkout PE failures before OS completion marker
      { fulfillmentStage: { in: ["order_received", "sample_free_issue", "print", "ready_to_dispatch", "dispatched", "delivery_complete"] } },
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
          { erpPeSyncError: { contains: term, mode: "insensitive" } },
          { erpPeSyncMop: { contains: term, mode: "insensitive" } },
        ],
      },
    ],
  };
}

/** Candidates that may be silent PE gaps (no error row yet). */
export function buildSilentErpPeGapCandidateWhere(
  companyId: string,
  search?: string,
): Prisma.OrderWhereInput {
  const base: Prisma.OrderWhereInput = {
    companyId,
    financialStatus: { not: "voided" },
    erpPeSyncError: null,
    erpnextInvoiceId: { not: null },
    NOT: {
      erpnextInvoiceId: { in: ["pending", "pending_approval"] },
    },
    ...FINANCE_PENDING_FULFILLMENT_EXCLUSION,
    OR: [
      { fulfillmentStage: "invoice_complete" },
      { invoiceCompleteAt: { not: null } },
    ],
  };

  const term = search?.trim();
  if (!term) return base;

  return {
    AND: [
      base,
      {
        OR: [
          { orderNumber: { endsWith: term, mode: "insensitive" } },
          { name: { endsWith: term, mode: "insensitive" } },
          { erpnextInvoiceId: { endsWith: term, mode: "insensitive" } },
          { shopifyOrderId: { contains: term, mode: "insensitive" } },
        ],
      },
    ],
  };
}

/**
 * Probe ERP for invoice-complete orders with no PE failure row; seed erpPeSync*
 * when SI still has outstanding so they appear on the Failed PE tab.
 */
export async function seedSilentErpPeGaps(companyId: string, limit = 15): Promise<number> {
  const candidates = await prisma.order.findMany({
    where: buildSilentErpPeGapCandidateWhere(companyId),
    orderBy: { invoiceCompleteAt: "desc" },
    take: limit,
    include: { companyLocation: { include: { erpnextInstance: true } } },
  });

  let seeded = 0;
  for (const order of candidates) {
    if (!order.companyLocation?.erpnextInstance || !order.erpnextInvoiceId) continue;
    try {
      const cfg = getErpConfig(order.companyLocation.erpnextInstance);
      if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) continue;
      const fields = encodeURIComponent(JSON.stringify(["name", "outstanding_amount"]));
      const res = await fetch(
        `${cfg.baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice/${encodeURIComponent(order.erpnextInvoiceId)}?fields=${fields}`,
        { headers: { Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}` } },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: { outstanding_amount?: number } };
      const outstanding = Number(json.data?.outstanding_amount ?? 0);
      if (outstanding <= 0) continue;

      const mop =
        resolveOrderPaymentMop(
          cfg,
          order.paymentGatewayPrimary,
          order.paymentGatewayNames,
        ) ?? ERP_PE_SYNC_MOP_ORDER_AUTO;
      await markOrderErpPeSyncFailed(
        order.id,
        `${ERP_PE_GAP_ERROR_PREFIX} — Sales Invoice ${order.erpnextInvoiceId} still has outstanding ${outstanding}`,
        mop,
      );
      seeded += 1;
    } catch (err) {
      console.warn("[ERP PE gap scan] failed for order", order.id, err);
    }
  }
  return seeded;
}

async function getOrderErpPeSyncAutoRetryCount(orderId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ erpPeSyncAutoRetryCount: number }>>(
    Prisma.sql`
      SELECT COALESCE("erpPeSyncAutoRetryCount", 0) AS "erpPeSyncAutoRetryCount"
      FROM "Order"
      WHERE "id" = ${orderId}
      LIMIT 1
    `,
  );
  return Number(rows[0]?.erpPeSyncAutoRetryCount ?? 0);
}

export async function markOrderErpPeSyncFailed(
  orderId: string,
  errorMessage: string,
  mopName: string,
  attemptedAt: Date = new Date(),
  options?: {
    scheduleAutoRetry?: boolean;
    incrementAutoRetryCount?: boolean;
  },
) {
  let autoRetryCount = await getOrderErpPeSyncAutoRetryCount(orderId);
  if (options?.incrementAutoRetryCount) {
    autoRetryCount += 1;
  }
  const classification = classifyFailedErpSyncError(errorMessage);
  const isSilentGap = clampErrorMessage(errorMessage).startsWith(ERP_PE_GAP_ERROR_PREFIX);
  const shouldSchedule =
    (options?.scheduleAutoRetry ?? true) &&
    !isSilentGap &&
    classification.retryable &&
    autoRetryCount < PE_AUTO_RETRY_DELAYS_MS.length;

  await prisma.order.update({
    where: { id: orderId },
    data: orderPeUpdate({
      erpPeSyncError: clampErrorMessage(errorMessage),
      erpPeSyncFailedAt: attemptedAt,
      erpPeSyncMop: mopName.trim().slice(0, 200),
      erpPeSyncLastAutoRetryAt: autoRetryCount > 0 ? attemptedAt : undefined,
      erpPeSyncNextAutoRetryAt: shouldSchedule
        ? getNextFailedErpPeSyncAutoRetryAt(autoRetryCount, attemptedAt)
        : null,
      erpPeSyncRetryLeaseExpiresAt: null,
      erpPeSyncAutoRetryCount: autoRetryCount,
    }),
  });
}

export async function clearOrderErpPeSyncFailure(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: orderPeUpdate(ERP_PE_SYNC_SUCCESS_CLEAR),
  });
}

type OrderForPeRetry = {
  erpPeSyncMop: string | null;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
  companyLocation: {
    erpnextInstance: Parameters<typeof getErpConfig>[0];
  } | null;
};

/** MOP to use when retrying a failed PE — never re-defaults to a new order payment mode. */
export function resolveFailedErpPeRetryMop(
  order: OrderForPeRetry,
  overrideMop?: string,
): string | null {
  const override = overrideMop?.trim();
  if (override) return override;

  const stored = order.erpPeSyncMop?.trim();
  if (stored && stored !== ERP_PE_SYNC_MOP_ORDER_AUTO) {
    return stored;
  }

  if (!order.companyLocation?.erpnextInstance) return null;
  const cfg = getErpConfig(order.companyLocation.erpnextInstance);
  return resolveOrderPaymentMop(cfg, order.paymentGatewayPrimary, order.paymentGatewayNames);
}

export async function retryOrderErpPeSync(input: {
  orderId: string;
  companyId: string;
  /** Explicit ERP MOP for this retry (from stored failure or optional override). */
  mopName: string;
  /** Allow repair for invoice_complete orders even before an error row exists. */
  allowWithoutPriorError?: boolean;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    include: { companyLocation: { include: { erpnextInstance: true } } },
  });
  if (!order?.companyLocation) {
    throw new Error("Order or company location not found");
  }
  const canRetry =
    order.fulfillmentStage === "invoice_complete" ||
    order.invoiceCompleteAt != null ||
    order.erpPeSyncError != null;
  if (!canRetry) {
    throw new Error(
      "Order must be invoice complete (or have a PE failure) to retry ERP payment entry",
    );
  }
  if (!order.erpPeSyncError && !input.allowWithoutPriorError) {
    throw new Error("No failed ERP payment entry on this order");
  }

  const pendingApproval = await prisma.approvalRequest.findFirst({
    where: {
      orderId: order.id,
      type: ORDER_PAYMENT_APPROVAL,
      status: "pending",
    },
    select: { id: true, paymentLines: { select: { id: true }, take: 1 } },
  });
  if (pendingApproval) {
    throw new Error(
      pendingApproval.paymentLines.length > 0
        ? SPLIT_PAYMENT_FINANCE_APPROVAL_PE_RETRY_ERROR
        : PENDING_FINANCE_APPROVAL_PE_RETRY_ERROR,
    );
  }

  const mopName = input.mopName.trim();
  if (!mopName) {
    throw new Error("ERP payment mode is required to retry");
  }

  const peResult = await syncOrderDeliveryPaymentEntriesToErp(
    {
      id: order.id,
      name: order.name,
      shopifyOrderId: order.shopifyOrderId,
      sourceName: order.sourceName,
      paymentGatewayPrimary: order.paymentGatewayPrimary,
      paymentGatewayNames: order.paymentGatewayNames,
      erpnextInvoiceId: order.erpnextInvoiceId,
    },
    order.companyLocation,
    new Date(),
    {
      mopNameOverride: mopName,
      requireMop: true,
    },
  );
  if (peResult.outcome === "skipped") {
    throw new Error("ERP payment entry was skipped unexpectedly");
  }

  // Early-complete paths (e.g. CC Checkout): establish financial completion without
  // forcing terminal fulfillmentStage when physical work is still open.
  if (order.fulfillmentStage !== "invoice_complete") {
    await markOrderFinanciallyInvoiceComplete({ orderId: order.id });
  }

  await clearOrderErpPeSyncFailure(order.id);
}

async function claimDueFailedErpPeSyncs(companyId: string | null, limit: number) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + PE_AUTO_RETRY_LEASE_MS);
  const where: Prisma.OrderWhereInput = {
    AND: [
      buildFailedErpPeSyncWhere(companyId ?? undefined),
      orderPeWhere({ erpPeSyncNextAutoRetryAt: { lte: now } }),
      orderPeWhere({
        OR: [
          { erpPeSyncRetryLeaseExpiresAt: null },
          { erpPeSyncRetryLeaseExpiresAt: { lte: now } },
        ],
      }),
    ],
  };

  const candidates = await prisma.order.findMany({
    where,
    orderBy: [
      orderPeOrderBy({ erpPeSyncNextAutoRetryAt: "asc" }),
      orderPeOrderBy({ erpPeSyncFailedAt: "asc" }),
    ],
    take: limit * 2,
    select: { id: true },
  });

  const claimedIds: string[] = [];

  for (const candidate of candidates) {
    const claimResult = await prisma.order.updateMany({
      where: orderPeWhere({
        id: candidate.id,
        erpPeSyncNextAutoRetryAt: { lte: now },
        OR: [
          { erpPeSyncRetryLeaseExpiresAt: null },
          { erpPeSyncRetryLeaseExpiresAt: { lte: now } },
        ],
      }),
      data: orderPeUpdateMany({ erpPeSyncRetryLeaseExpiresAt: leaseUntil }),
    });

    if (claimResult.count === 1) {
      claimedIds.push(candidate.id);
    }
    if (claimedIds.length >= limit) break;
  }

  if (claimedIds.length === 0) return [];

  return prisma.order.findMany({
    where: { id: { in: claimedIds } },
    include: { companyLocation: { include: { erpnextInstance: true } } },
    orderBy: { erpPeSyncFailedAt: "asc" },
  });
}

/** Drop PE failure rows that should wait on Finance Approvals, not Failed PE retry. */
export async function clearPendingFinanceApprovalErpPeSyncFailures(
  companyId: string,
  limit = 50,
): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      erpPeSyncError: { not: null },
      approvalRequests: {
        some: { type: ORDER_PAYMENT_APPROVAL, status: "pending" },
      },
    },
    take: limit,
    select: { id: true },
  });
  for (const order of orders) {
    await clearOrderErpPeSyncFailure(order.id);
  }
  return orders.length;
}

export async function scheduleUnscheduledFailedErpPeSyncs(companyId?: string, limit = 50) {
  const orders = await prisma.order.findMany({
    where: orderPeWhere({
      AND: [
        buildFailedErpPeSyncWhere(companyId),
        { erpPeSyncNextAutoRetryAt: null },
      ],
    }),
    take: limit,
    select: {
      id: true,
      erpPeSyncError: true,
    },
  });

  for (const order of orders) {
    const errorText = order.erpPeSyncError ?? "";
    if (!errorText || errorText.startsWith(ERP_PE_GAP_ERROR_PREFIX)) continue;
    const classification = classifyFailedErpSyncError(errorText);
    if (!classification.retryable) continue;

    const autoRetryCount = await getOrderErpPeSyncAutoRetryCount(order.id);
    await prisma.order.update({
      where: { id: order.id },
      data: orderPeUpdate({
        erpPeSyncNextAutoRetryAt: getNextFailedErpPeSyncAutoRetryAt(autoRetryCount),
      }),
    });
  }
}

export async function runDueFailedErpPeSyncRetries(options?: {
  companyId?: string | null;
  limit?: number;
}) {
  const claimed = await claimDueFailedErpPeSyncs(
    options?.companyId ?? null,
    Math.max(1, Math.min(options?.limit ?? PE_AUTO_RETRY_BATCH_LIMIT, 50)),
  );

  let processed = 0;
  let resolved = 0;
  let failed = 0;
  let skipped = 0;

  for (const order of claimed) {
    processed += 1;
    const errorText = order.erpPeSyncError ?? "";
    if (errorText.startsWith(ERP_PE_GAP_ERROR_PREFIX)) {
      skipped += 1;
      await prisma.order.update({
        where: { id: order.id },
        data: orderPeUpdate({ erpPeSyncRetryLeaseExpiresAt: null, erpPeSyncNextAutoRetryAt: null }),
      });
      continue;
    }

    const mopName = resolveFailedErpPeRetryMop(order);
    if (!mopName) {
      skipped += 1;
      await prisma.order.update({
        where: { id: order.id },
        data: orderPeUpdate({ erpPeSyncRetryLeaseExpiresAt: null }),
      });
      continue;
    }

    try {
      await retryOrderErpPeSync({
        orderId: order.id,
        companyId: order.companyId,
        mopName,
      });
      resolved += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (isPendingFinanceApprovalPeRetryError(errorMessage)) {
        skipped += 1;
        await clearOrderErpPeSyncFailure(order.id);
        continue;
      }
      failed += 1;
      await markOrderErpPeSyncFailed(order.id, errorMessage, mopName, new Date(), {
        incrementAutoRetryCount: true,
        scheduleAutoRetry: true,
      });
    }
  }

  return { processed, resolved, failed, skipped };
}
