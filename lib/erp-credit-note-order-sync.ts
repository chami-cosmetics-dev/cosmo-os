import type { Prisma } from "@prisma/client";

import { erpInvoiceReferenceLookupValues } from "@/lib/erp-invoice-reference";
import { cancelPendingApprovalsForOrder } from "@/lib/approval-workflow";
import {
  mergeErpReturnSalesInvoiceIds,
  normalizeErpReturnSalesInvoiceIds,
} from "@/lib/erp-return-si";
import { prisma } from "@/lib/prisma";

export const ERP_CREDIT_NOTE_ISSUED_STATUS = "Credit Note Issued";

/** Vault OS order state after ERP issues a credit note against the invoice. */
export const ERP_CREDIT_NOTE_ORDER_PATCH = {
  fulfillmentStage: "returned",
  financialStatus: "voided",
  erpnextSyncError: null,
  erpnextSyncFailedAt: null,
  erpnextSyncAutoRetryCount: 0,
  erpnextSyncLastAutoRetryAt: null,
  erpnextSyncNextAutoRetryAt: null,
  erpnextSyncRetryLeaseExpiresAt: null,
} as const satisfies Prisma.OrderUpdateInput;

export type ErpSalesInvoiceCreditNoteSignal = {
  name: string;
  is_return?: number | null;
  grand_total?: number | null;
  return_against?: string | null;
  status?: string | null;
  docstatus?: number | null;
};

export function isErpReturnSalesInvoice(
  isReturn: number | null | undefined,
  grandTotal: number | null | undefined,
  returnAgainst?: string | null,
): boolean {
  // ERP sometimes posts a separate return SI (return_against set) without flipping
  // the original invoice to "Credit Note Issued".
  if (returnAgainst?.trim()) return true;
  return isReturn === 1 || (grandTotal != null && grandTotal < 0);
}

export function isErpSalesInvoiceCreditNoted(
  status: string | null | undefined,
  _docstatus?: number | null
): boolean {
  // Cancelled invoices (docstatus 2) are voids, not credit notes — do not use docstatus here.
  const normalized = status?.trim().toLowerCase() ?? "";
  return normalized === ERP_CREDIT_NOTE_ISSUED_STATUS.toLowerCase();
}

/** ERP Sales Invoice cancelled (docstatus 2) — OS should void financially, not mark Returned. */
export function isErpSalesInvoiceCancelled(
  docstatus: number | null | undefined
): boolean {
  return docstatus === 2;
}

/** Void original OS order for ERP cancel — do not move to Returned. */
export async function applyErpCancelToOriginalOrder(invoiceRef: string) {
  const original = await prisma.order.findFirst({
    where: orderMatchesErpInvoiceReference(invoiceRef),
    select: {
      id: true,
      name: true,
      financialStatus: true,
      fulfillmentStage: true,
    },
  });
  if (!original) return null;

  await prisma.order.update({
    where: { id: original.id },
    data: {
      financialStatus: "voided",
      // Leave fulfillment stage alone unless it was wrongly set to ERP "returned"
      ...(original.fulfillmentStage === "returned"
        ? { fulfillmentStage: "order_received" }
        : {}),
      erpnextSyncError: null,
      erpnextSyncFailedAt: null,
      erpnextSyncAutoRetryCount: 0,
      erpnextSyncLastAutoRetryAt: null,
      erpnextSyncNextAutoRetryAt: null,
      erpnextSyncRetryLeaseExpiresAt: null,
    },
  });
  await cancelPendingApprovalsForOrder(original.id);
  return original;
}

export function erpInvoiceIndicatesCreditNote(
  invoice: {
    status?: string | null;
    docstatus?: number | null;
  },
  creditNotes: Array<{ docstatus?: number | null }>
): boolean {
  if (isErpSalesInvoiceCreditNoted(invoice.status, invoice.docstatus ?? null)) {
    return true;
  }
  return creditNotes.some((cn) => cn.docstatus === 1 || cn.docstatus === 2);
}

export function orderMatchesErpInvoiceReference(
  invoiceRef: string,
): Prisma.OrderWhereInput {
  const or: Prisma.OrderWhereInput[] = [];
  for (const variant of erpInvoiceReferenceLookupValues(invoiceRef)) {
    or.push(
      { erpnextInvoiceId: variant },
      { name: variant },
      { shopifyOrderId: variant },
      { shopifyOrderId: `erp-${variant}` },
    );
  }
  return { OR: or };
}

export async function findOrderForErpInvoiceReference(invoiceRef: string) {
  const trimmed = invoiceRef.trim();
  if (!trimmed) return null;

  return prisma.order.findFirst({
    where: orderMatchesErpInvoiceReference(trimmed),
    select: {
      id: true,
      name: true,
      erpnextInvoiceId: true,
      financialStatus: true,
      fulfillmentStage: true,
    },
  });
}

/** Persist Return SI ids on an order without touching original SI / void state. */
export async function appendErpReturnSalesInvoiceIds(
  orderId: string,
  existingIds: string[] | null | undefined,
  returnInvoiceName: string | null | undefined,
): Promise<string[]> {
  const merged = mergeErpReturnSalesInvoiceIds(existingIds, returnInvoiceName);
  if (
    merged.length === (existingIds?.length ?? 0) &&
    merged.every((id, i) => id === existingIds?.[i])
  ) {
    return merged;
  }
  await prisma.order.update({
    where: { id: orderId },
    data: { erpReturnSalesInvoiceIds: merged },
  });
  return merged;
}

/** Mark the original Vault OS order voided/returned after ERP issues a credit note. */
export async function applyErpCreditNoteToOriginalOrder(
  returnAgainst: string,
  options?: { returnInvoiceName?: string | null },
) {
  const original = await prisma.order.findFirst({
    where: orderMatchesErpInvoiceReference(returnAgainst),
    select: {
      id: true,
      name: true,
      financialStatus: true,
      fulfillmentStage: true,
      erpReturnSalesInvoiceIds: true,
      revertedFromInvoiceCompleteAt: true,
      returns: {
        select: { actionType: true },
      },
    },
  });
  if (!original) return null;

  const returnInvoiceName = options?.returnInvoiceName?.trim() || null;

  // Credit note was triggered by OS itself at revert time — OS state is already correct ("refunded").
  // Skip auto-void to prevent the webhook from overwriting the partial-void state.
  // Still record Return SI when known so search/detail stay accurate.
  if (original.revertedFromInvoiceCompleteAt) {
    console.log(`[ERP CN] Skipping auto-void for finance-reverted order ${original.id} (${original.name})`);
    if (returnInvoiceName) {
      await appendErpReturnSalesInvoiceIds(
        original.id,
        original.erpReturnSalesInvoiceIds,
        returnInvoiceName,
      );
    }
    return original;
  }

  // Order has been rearranged and is actively moving through the dispatch pipeline again.
  // A delayed ERP credit note webhook must not re-void it and knock it out of the rearrange queue.
  const REARRANGED_ACTIVE_STAGES = ["order_received", "sample_free_issue", "print", "ready_to_dispatch"] as const;
  const hasRearrangeReturn = original.returns.some((r) => r.actionType === "rearrange");
  if (
    hasRearrangeReturn &&
    REARRANGED_ACTIVE_STAGES.includes(original.fulfillmentStage as (typeof REARRANGED_ACTIVE_STAGES)[number])
  ) {
    console.log(`[ERP CN] Skipping auto-void for rearranged order ${original.id} (${original.name}) — currently at ${original.fulfillmentStage}`);
    if (returnInvoiceName) {
      await appendErpReturnSalesInvoiceIds(
        original.id,
        original.erpReturnSalesInvoiceIds,
        returnInvoiceName,
      );
    }
    return original;
  }

  const nextReturnIds = returnInvoiceName
    ? mergeErpReturnSalesInvoiceIds(original.erpReturnSalesInvoiceIds, returnInvoiceName)
    : original.erpReturnSalesInvoiceIds;

  await prisma.order.update({
    where: { id: original.id },
    data: {
      ...ERP_CREDIT_NOTE_ORDER_PATCH,
      ...(returnInvoiceName ? { erpReturnSalesInvoiceIds: nextReturnIds } : {}),
    },
  });

  await cancelPendingApprovalsForOrder(original.id);

  return original;
}

/**
 * Handle ERP Sales Invoice webhook payloads that represent a credit note or a
 * credit-noted original invoice. Returns whether the event was handled.
 */
export async function handleErpSalesInvoiceCreditNoteEvent(
  data: ErpSalesInvoiceCreditNoteSignal
): Promise<{ handled: boolean; orderId?: string }> {
  if (isErpReturnSalesInvoice(data.is_return, data.grand_total ?? null, data.return_against)) {
    const returnAgainst = data.return_against?.trim() || null;
    if (!returnAgainst) return { handled: false };

    const original = await applyErpCreditNoteToOriginalOrder(returnAgainst, {
      returnInvoiceName: data.name,
    });
    if (!original) return { handled: false };

    return { handled: true, orderId: original.id };
  }

  // Cancelled original SI → void only (not Returned / credit-note path)
  if (
    isErpSalesInvoiceCancelled(data.docstatus ?? null) &&
    data.is_return !== 1
  ) {
    const original = await applyErpCancelToOriginalOrder(data.name);
    if (!original) return { handled: false };
    return { handled: true, orderId: original.id };
  }

  if (
    data.is_return !== 1 &&
    isErpSalesInvoiceCreditNoted(data.status, data.docstatus ?? null)
  ) {
    const original = await applyErpCreditNoteToOriginalOrder(data.name);
    if (!original) return { handled: false };

    return { handled: true, orderId: original.id };
  }

  return { handled: false };
}

type ErpInstanceCreds = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

async function fetchErpSalesInvoice(
  creds: ErpInstanceCreds,
  invoiceName: string,
): Promise<Record<string, unknown> | null> {
  for (const variant of erpInvoiceReferenceLookupValues(invoiceName)) {
    try {
      const res = await fetch(
        `${creds.baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice/${encodeURIComponent(variant)}`,
        {
          headers: { Authorization: `token ${creds.apiKey}:${creds.apiSecret}` },
        },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: Record<string, unknown> };
      if (json.data) return json.data;
    } catch {
      // try next variant
    }
  }
  return null;
}

export async function fetchErpCreditNotesAgainst(
  creds: ErpInstanceCreds,
  invoiceName: string,
): Promise<Array<{ name?: string; docstatus?: number | null }>> {
  const seen = new Set<string>();
  const results: Array<{ name?: string; docstatus?: number | null }> = [];

  for (const variant of erpInvoiceReferenceLookupValues(invoiceName)) {
    try {
      const filters = encodeURIComponent(
        JSON.stringify([["return_against", "=", variant]]),
      );
      const fields = encodeURIComponent(JSON.stringify(["name", "docstatus"]));
      const res = await fetch(
        `${creds.baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit_page_length=20`,
        { headers: { Authorization: `token ${creds.apiKey}:${creds.apiSecret}` } },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: Array<{ name?: string; docstatus?: number | null }>;
      };
      for (const row of json.data ?? []) {
        const key = row.name ?? `${variant}:${row.docstatus ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(row);
      }
    } catch {
      // try next variant
    }
  }

  return results;
}

function creditNoteReturnNames(
  creditNotes: Array<{ name?: string; docstatus?: number | null }>,
): string[] {
  return normalizeErpReturnSalesInvoiceIds(
    creditNotes
      .filter((cn) => cn.docstatus === 1 || cn.docstatus === 2)
      .map((cn) => cn.name),
  );
}

/** Poll ERP when the webhook was missed; apply credit-note state if ERP shows one. */
export async function reconcileOrderErpCreditNote(orderId: string): Promise<{
  updated: boolean;
  reason: string;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      name: true,
      erpnextInvoiceId: true,
      erpReturnSalesInvoiceIds: true,
      financialStatus: true,
      fulfillmentStage: true,
      revertedFromInvoiceCompleteAt: true,
      companyLocation: {
        select: {
          erpnextInstance: {
            select: { baseUrl: true, apiKey: true, apiSecret: true },
          },
        },
      },
    },
  });

  const invoiceName = order?.erpnextInvoiceId?.trim() || order?.name?.trim();
  const instance = order?.companyLocation?.erpnextInstance;
  if (!order || !invoiceName || !instance) {
    return { updated: false, reason: "order_or_erp_instance_not_found" };
  }

  const creds: ErpInstanceCreds = {
    baseUrl: instance.baseUrl,
    apiKey: instance.apiKey,
    apiSecret: instance.apiSecret,
  };

  // Already voided/returned — still backfill Return SI ids when ERP has them.
  if (order.financialStatus === "voided" && order.fulfillmentStage === "returned") {
    const creditNotes = await fetchErpCreditNotesAgainst(creds, invoiceName);
    const names = creditNoteReturnNames(creditNotes);
    if (names.length === 0) {
      return { updated: false, reason: "already_credit_noted" };
    }
    const merged = mergeErpReturnSalesInvoiceIds(order.erpReturnSalesInvoiceIds, names);
    if (
      merged.length === order.erpReturnSalesInvoiceIds.length &&
      merged.every((id, i) => id === order.erpReturnSalesInvoiceIds[i])
    ) {
      return { updated: false, reason: "already_credit_noted" };
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { erpReturnSalesInvoiceIds: merged },
    });
    return { updated: true, reason: "return_si_backfilled" };
  }

  // Credit note was issued by OS at revert time — don't overwrite the "refunded" partial-void state.
  if (order.revertedFromInvoiceCompleteAt) {
    const creditNotes = await fetchErpCreditNotesAgainst(creds, invoiceName);
    const names = creditNoteReturnNames(creditNotes);
    if (names.length === 0) {
      return { updated: false, reason: "finance_reverted_order_skipped" };
    }
    const merged = mergeErpReturnSalesInvoiceIds(order.erpReturnSalesInvoiceIds, names);
    if (
      merged.length === order.erpReturnSalesInvoiceIds.length &&
      merged.every((id, i) => id === order.erpReturnSalesInvoiceIds[i])
    ) {
      return { updated: false, reason: "finance_reverted_order_skipped" };
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { erpReturnSalesInvoiceIds: merged },
    });
    return { updated: true, reason: "return_si_recorded_finance_reverted" };
  }

  const [invoice, creditNotes] = await Promise.all([
    fetchErpSalesInvoice(creds, invoiceName),
    fetchErpCreditNotesAgainst(creds, invoiceName),
  ]);

  if (!invoice) {
    return { updated: false, reason: "erp_invoice_not_found" };
  }

  const status = typeof invoice.status === "string" ? invoice.status : null;
  const docstatus = typeof invoice.docstatus === "number" ? invoice.docstatus : null;

  if (!erpInvoiceIndicatesCreditNote({ status, docstatus }, creditNotes)) {
    return { updated: false, reason: "no_credit_note_in_erp" };
  }

  const names = creditNoteReturnNames(creditNotes);
  const nextReturnIds = names.length
    ? mergeErpReturnSalesInvoiceIds(order.erpReturnSalesInvoiceIds, names)
    : order.erpReturnSalesInvoiceIds;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      ...ERP_CREDIT_NOTE_ORDER_PATCH,
      ...(names.length ? { erpReturnSalesInvoiceIds: nextReturnIds } : {}),
    },
  });

  return { updated: true, reason: "credit_note_applied" };
}

/** Safety net for missed ERP webhooks — checks a small batch of active ERP-linked orders. */
export async function reconcileMissedErpCreditNotes(options?: { limit?: number }) {
  const limit = Math.min(Math.max(options?.limit ?? 15, 1), 50);

  const candidates = await prisma.order.findMany({
    where: {
      financialStatus: { not: "voided" },
      fulfillmentStage: { not: "returned" },
      erpnextInvoiceId: { not: null },
      NOT: [{ erpnextInvoiceId: "pending" }, { erpnextInvoiceId: "pending_approval" }],
      companyLocation: { erpnextInstanceId: { not: null } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true },
  });

  let checked = 0;
  let updated = 0;

  for (const candidate of candidates) {
    checked += 1;
    const result = await reconcileOrderErpCreditNote(candidate.id);
    if (result.updated) updated += 1;
  }

  return { checked, updated };
}
