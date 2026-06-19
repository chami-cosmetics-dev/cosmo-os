import type { Prisma } from "@prisma/client";

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
  grandTotal: number | null | undefined
): boolean {
  return isReturn === 1 || (grandTotal != null && grandTotal < 0);
}

export function isErpSalesInvoiceCreditNoted(
  status: string | null | undefined,
  docstatus: number | null | undefined
): boolean {
  if (docstatus === 2) return true;
  const normalized = status?.trim().toLowerCase() ?? "";
  return normalized === ERP_CREDIT_NOTE_ISSUED_STATUS.toLowerCase();
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
  invoiceRef: string
): Prisma.OrderWhereInput {
  const trimmed = invoiceRef.trim();
  return {
    OR: [
      { erpnextInvoiceId: trimmed },
      { name: trimmed },
      { shopifyOrderId: trimmed },
      { shopifyOrderId: `erp-${trimmed}` },
    ],
  };
}

export async function findOrderForErpInvoiceReference(invoiceRef: string) {
  const trimmed = invoiceRef.trim();
  if (!trimmed) return null;

  return prisma.order.findFirst({
    where: orderMatchesErpInvoiceReference(trimmed),
    select: { id: true, name: true, financialStatus: true, fulfillmentStage: true },
  });
}

/** Mark the original Vault OS order voided/returned after ERP issues a credit note. */
export async function applyErpCreditNoteToOriginalOrder(returnAgainst: string) {
  const original = await findOrderForErpInvoiceReference(returnAgainst);
  if (!original) return null;

  await prisma.order.update({
    where: { id: original.id },
    data: ERP_CREDIT_NOTE_ORDER_PATCH,
  });

  return original;
}

/**
 * Handle ERP Sales Invoice webhook payloads that represent a credit note or a
 * credit-noted original invoice. Returns whether the event was handled.
 */
export async function handleErpSalesInvoiceCreditNoteEvent(
  data: ErpSalesInvoiceCreditNoteSignal
): Promise<{ handled: boolean; orderId?: string }> {
  if (isErpReturnSalesInvoice(data.is_return, data.grand_total ?? null)) {
    const returnAgainst = data.return_against?.trim() || null;
    if (!returnAgainst) return { handled: false };

    const original = await applyErpCreditNoteToOriginalOrder(returnAgainst);
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
  invoiceName: string
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `${creds.baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}`,
      {
        headers: { Authorization: `token ${creds.apiKey}:${creds.apiSecret}` },
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Record<string, unknown> };
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function fetchErpCreditNotesAgainst(
  creds: ErpInstanceCreds,
  invoiceName: string
): Promise<Array<{ docstatus?: number | null }>> {
  try {
    const filters = encodeURIComponent(
      JSON.stringify([["return_against", "=", invoiceName]])
    );
    const fields = encodeURIComponent(JSON.stringify(["name", "docstatus"]));
    const res = await fetch(
      `${creds.baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit_page_length=5`,
      { headers: { Authorization: `token ${creds.apiKey}:${creds.apiSecret}` } }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Array<{ docstatus?: number | null }> };
    return json.data ?? [];
  } catch {
    return [];
  }
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
      financialStatus: true,
      fulfillmentStage: true,
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

  if (order.financialStatus === "voided" && order.fulfillmentStage === "returned") {
    return { updated: false, reason: "already_credit_noted" };
  }

  const creds: ErpInstanceCreds = {
    baseUrl: instance.baseUrl,
    apiKey: instance.apiKey,
    apiSecret: instance.apiSecret,
  };

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

  await prisma.order.update({
    where: { id: order.id },
    data: ERP_CREDIT_NOTE_ORDER_PATCH,
  });

  return { updated: true, reason: "credit_note_applied" };
}

const ACTIVE_FULFILLMENT_STAGES = [
  "order_received",
  "sample_free_issue",
  "print",
  "ready_to_dispatch",
  "dispatched",
  "invoice_complete",
  "delivery_complete",
] as const;

/** Safety net for missed ERP webhooks — checks a small batch of active ERP-linked orders. */
export async function reconcileMissedErpCreditNotes(options?: { limit?: number }) {
  const limit = Math.min(Math.max(options?.limit ?? 15, 1), 50);

  const candidates = await prisma.order.findMany({
    where: {
      financialStatus: { not: "voided" },
      fulfillmentStage: { in: [...ACTIVE_FULFILLMENT_STAGES] },
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
