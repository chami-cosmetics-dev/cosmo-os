import { Prisma } from "@prisma/client";

import { formatFailedErpSyncErrorMessage } from "@/lib/failed-erp-sync-classification";
import {
  createDeliveryPaymentEntry,
  getErpConfig,
  resolveOrderPaymentMop,
} from "@/lib/erpnext-sync";
import { prisma } from "@/lib/prisma";

/** Stored when invoice-complete used order payment gateways (legacy label). */
export const ERP_PE_SYNC_MOP_ORDER_AUTO = "order payment mode";

export const ERP_PE_GAP_ERROR_PREFIX = "PE missing";

function clampErrorMessage(message: string) {
  return formatFailedErpSyncErrorMessage(message).slice(0, 10_000);
}

export function buildFailedErpPeSyncWhere(companyId?: string, search?: string): Prisma.OrderWhereInput {
  const base: Prisma.OrderWhereInput = {
    ...(companyId ? { companyId } : {}),
    financialStatus: { not: "voided" },
    erpPeSyncError: { not: null },
    fulfillmentStage: "invoice_complete",
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
    fulfillmentStage: "invoice_complete",
    erpPeSyncError: null,
    erpnextInvoiceId: { not: null },
    NOT: {
      erpnextInvoiceId: { in: ["pending", "pending_approval"] },
    },
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

export async function markOrderErpPeSyncFailed(
  orderId: string,
  errorMessage: string,
  mopName: string,
  attemptedAt: Date = new Date(),
) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      erpPeSyncError: clampErrorMessage(errorMessage),
      erpPeSyncFailedAt: attemptedAt,
      erpPeSyncMop: mopName.trim().slice(0, 200),
    },
  });
}

export async function clearOrderErpPeSyncFailure(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      erpPeSyncError: null,
      erpPeSyncFailedAt: null,
      erpPeSyncMop: null,
    },
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
  if (order.fulfillmentStage !== "invoice_complete") {
    throw new Error("Order must be invoice complete to retry ERP payment entry");
  }
  if (!order.erpPeSyncError && !input.allowWithoutPriorError) {
    throw new Error("No failed ERP payment entry on this order");
  }

  const mopName = input.mopName.trim();
  if (!mopName) {
    throw new Error("ERP payment mode is required to retry");
  }

  await createDeliveryPaymentEntry(
    {
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

  await clearOrderErpPeSyncFailure(order.id);
}
