import type { Prisma } from "@prisma/client";

import {
  cancelErpnextSalesInvoice,
  ensureErpnextCreditNote,
  type LocationWithErpInstance,
} from "@/lib/erpnext-sync";
import { ERP_CREDIT_NOTE_ORDER_PATCH } from "@/lib/erp-credit-note-order-sync";
import { mergeErpReturnSalesInvoiceIds } from "@/lib/erp-return-si";
import {
  cancelShopifyOrder,
  isRealShopifyOrderId,
  shouldBlockShopifyCancelInOs,
} from "@/lib/shopify-admin";

export type ReturnCancelCompletionMode = "credit_note" | "cancel_si";

export type ReturnCancelErpOutcome =
  | "credit_note"
  | "cancelled"
  | "already_done"
  | "failed";

export type ReturnCancelShopifyOutcome =
  | "cancelled"
  | "already_cancelled"
  | "not_applicable"
  | "failed"
  | "skipped_vault";

export type ReturnCancelExternalResult = {
  ok: boolean;
  completionMode: ReturnCancelCompletionMode;
  erpOutcome: ReturnCancelErpOutcome;
  creditNoteName?: string;
  invoiceName?: string;
  originalStatus?: string;
  shopifyOutcome: ReturnCancelShopifyOutcome;
  error?: string;
};

const SANITIZE_MAX = 500;
const SECRETISH = /(token|api[_-]?key|api[_-]?secret|authorization|password|bearer)/i;

export function isFullyPaidFinancialStatus(status: string | null | undefined): boolean {
  return status?.trim().toLowerCase() === "paid";
}

export function resolveReturnCancelCompletionMode(
  financialStatus: string | null | undefined,
): ReturnCancelCompletionMode {
  return isFullyPaidFinancialStatus(financialStatus) ? "credit_note" : "cancel_si";
}

/** Strip credentials and bound length for client-facing approve errors. */
export function sanitizeReturnCancelError(raw: unknown): string {
  let text = raw instanceof Error ? raw.message : String(raw ?? "Return cancel completion failed");
  text = text.replace(/token\s+[^\s]+/gi, "token [REDACTED]");
  text = text.replace(/Authorization:\s*[^\s]+/gi, "Authorization: [REDACTED]");
  if (SECRETISH.test(text)) {
    text = text.replace(/:[^\s,'"]+/g, ":[REDACTED]");
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!text) text = "Return cancel completion failed";
  return text.length > SANITIZE_MAX ? `${text.slice(0, SANITIZE_MAX - 1)}…` : text;
}

export type ReturnCancelCompletionOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string | null;
  financialStatus: string | null;
  erpnextInvoiceId: string | null;
  erpReturnSalesInvoiceIds: string[];
  cancelReason: string | null;
};

export type ReturnCancelCompletionDeps = {
  ensureErpnextCreditNote: typeof ensureErpnextCreditNote;
  cancelErpnextSalesInvoice: typeof cancelErpnextSalesInvoice;
  cancelShopifyOrder: typeof cancelShopifyOrder;
  shouldBlockShopifyCancelInOs: typeof shouldBlockShopifyCancelInOs;
  isRealShopifyOrderId: typeof isRealShopifyOrderId;
};

const defaultDeps: ReturnCancelCompletionDeps = {
  ensureErpnextCreditNote,
  cancelErpnextSalesInvoice,
  cancelShopifyOrder,
  shouldBlockShopifyCancelInOs,
  isRealShopifyOrderId,
};

async function cancelShopifyForReturn(
  order: ReturnCancelCompletionOrder,
  shopifyAdminStoreHandle: string | null | undefined,
  deps: ReturnCancelCompletionDeps,
): Promise<ReturnCancelShopifyOutcome> {
  if (!deps.isRealShopifyOrderId(order.shopifyOrderId)) {
    return "not_applicable";
  }
  if (deps.shouldBlockShopifyCancelInOs(order.shopifyOrderId)) {
    return "skipped_vault";
  }
  if (!shopifyAdminStoreHandle?.trim()) {
    return "not_applicable";
  }
  try {
    await deps.cancelShopifyOrder(order.shopifyOrderId!, shopifyAdminStoreHandle.trim());
    return "cancelled";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already cancelled|already_canceled|422/i.test(msg)) {
      return "already_cancelled";
    }
    throw err;
  }
}

/**
 * Run ERP (+ Shopify when applicable) for return-cancel finance approve.
 * Does not write OS state — caller finalizes in a DB transaction on success.
 */
export async function runReturnCancelExternalCompletion(input: {
  order: ReturnCancelCompletionOrder;
  location: LocationWithErpInstance;
  deps?: Partial<ReturnCancelCompletionDeps>;
}): Promise<ReturnCancelExternalResult> {
  const deps: ReturnCancelCompletionDeps = { ...defaultDeps, ...input.deps };
  const completionMode = resolveReturnCancelCompletionMode(input.order.financialStatus);
  const shopifyHandle = input.location.shopifyAdminStoreHandle;

  try {
    if (completionMode === "credit_note") {
      const ensured = await deps.ensureErpnextCreditNote(
        {
          id: input.order.id,
          name: input.order.name,
          orderNumber: input.order.orderNumber,
          erpnextInvoiceId: input.order.erpnextInvoiceId,
          erpReturnSalesInvoiceIds: input.order.erpReturnSalesInvoiceIds,
        },
        input.location,
        { requireOriginalCreditNoted: true },
      );

      let shopifyOutcome: ReturnCancelShopifyOutcome;
      try {
        shopifyOutcome = await cancelShopifyForReturn(input.order, shopifyHandle, deps);
      } catch (err) {
        return {
          ok: false,
          completionMode,
          erpOutcome: ensured.created ? "credit_note" : "already_done",
          creditNoteName: ensured.creditNoteName,
          invoiceName: ensured.originalInvoiceName,
          originalStatus: ensured.originalStatus,
          shopifyOutcome: "failed",
          error: sanitizeReturnCancelError(err),
        };
      }

      return {
        ok: true,
        completionMode,
        erpOutcome: ensured.created ? "credit_note" : "already_done",
        creditNoteName: ensured.creditNoteName,
        invoiceName: ensured.originalInvoiceName,
        originalStatus: ensured.originalStatus,
        shopifyOutcome,
      };
    }

    const cancelResult = await deps.cancelErpnextSalesInvoice(
      input.order.name ?? input.order.orderNumber ?? "",
      input.location,
      {
        strict: true,
        directInvoiceName: input.order.erpnextInvoiceId ?? undefined,
      },
    );

    if (cancelResult.outcome === "not_found") {
      return {
        ok: false,
        completionMode,
        erpOutcome: "failed",
        shopifyOutcome: "not_applicable",
        error: sanitizeReturnCancelError(
          "ERP Sales Invoice not found for this unpaid return. Fix the invoice in ERPNext, then approve again.",
        ),
      };
    }

    let shopifyOutcome: ReturnCancelShopifyOutcome;
    try {
      shopifyOutcome = await cancelShopifyForReturn(input.order, shopifyHandle, deps);
    } catch (err) {
      return {
        ok: false,
        completionMode,
        erpOutcome: cancelResult.outcome === "already_cancelled" ? "already_done" : "cancelled",
        invoiceName: cancelResult.invoiceName,
        shopifyOutcome: "failed",
        error: sanitizeReturnCancelError(err),
      };
    }

    return {
      ok: true,
      completionMode,
      erpOutcome: cancelResult.outcome === "already_cancelled" ? "already_done" : "cancelled",
      invoiceName: cancelResult.invoiceName,
      shopifyOutcome,
    };
  } catch (err) {
    return {
      ok: false,
      completionMode,
      erpOutcome: "failed",
      shopifyOutcome: "not_applicable",
      error: sanitizeReturnCancelError(err),
    };
  }
}

type TxClient = Prisma.TransactionClient;

/** Apply OS void/returned + solve return after successful external completion. */
export async function finalizeReturnCancelOsState(
  tx: TxClient,
  input: {
    orderId: string;
    orderReturnId: string;
    reviewerId: string;
    now: Date;
    cancelRemark: string | null;
    completion: ReturnCancelExternalResult;
    existingReturnSiIds: string[];
  },
): Promise<void> {
  const { completion } = input;
  if (!completion.ok) {
    throw new Error("Cannot finalize failed return-cancel completion");
  }

  const nextReturnIds =
    completion.completionMode === "credit_note" && completion.creditNoteName
      ? mergeErpReturnSalesInvoiceIds(input.existingReturnSiIds, completion.creditNoteName)
      : input.existingReturnSiIds;

  await tx.order.update({
    where: { id: input.orderId },
    data: {
      ...ERP_CREDIT_NOTE_ORDER_PATCH,
      cancelledAt: input.now,
      cancelledById: input.reviewerId,
      cancelReason: input.cancelRemark,
      ...(completion.completionMode === "credit_note" && completion.creditNoteName
        ? { erpReturnSalesInvoiceIds: nextReturnIds }
        : {}),
    },
  });

  await tx.orderReturn.update({
    where: { id: input.orderReturnId },
    data: {
      actionStatus: "solved",
      actionType: "cancel",
      actionDate: input.now,
      actionById: input.reviewerId,
    },
  });
}
