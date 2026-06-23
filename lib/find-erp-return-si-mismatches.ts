import {
  erpInvoiceIndicatesCreditNote,
  findOrderForErpInvoiceReference,
  isErpSalesInvoiceCreditNoted,
  orderMatchesErpInvoiceReference,
} from "@/lib/erp-credit-note-order-sync";
import { erpInvoiceReferenceLookupValues } from "@/lib/erp-invoice-reference";
import { prisma } from "@/lib/prisma";

export type ErpInstanceCreds = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

export type ErpReturnSiMismatchPattern =
  /** Return SI in ERP; original SI never got "Credit Note Issued"; OS order still active. */
  | "return_si_original_not_credit_noted_os_active"
  /** Return SI in ERP; OS order still active (original may already be credit-noted). */
  | "return_si_exists_os_active";

export type ErpReturnSiMismatch = {
  pattern: ErpReturnSiMismatchPattern;
  originalInvoiceName: string;
  originalErpStatus: string | null;
  originalErpDocstatus: number | null;
  originalCreditNotedInErp: boolean;
  returnInvoiceNames: string[];
  vaultOrder: {
    id: string;
    name: string | null;
    erpnextInvoiceId: string | null;
    financialStatus: string | null;
    fulfillmentStage: string;
  } | null;
};

type ErpSalesInvoiceRow = {
  name?: string;
  status?: string | null;
  docstatus?: number | null;
  return_against?: string | null;
  is_return?: number | null;
  modified?: string | null;
};

function authHeader(creds: ErpInstanceCreds) {
  return { Authorization: `token ${creds.apiKey}:${creds.apiSecret}` };
}

function erpBase(creds: ErpInstanceCreds) {
  return creds.baseUrl.replace(/\/$/, "");
}

export function isVaultOrderActiveForReturnSync(order: {
  financialStatus: string | null;
  fulfillmentStage: string | null;
} | null): boolean {
  if (!order) return false;
  return order.financialStatus !== "voided" || order.fulfillmentStage !== "returned";
}

export function classifyErpReturnSiMismatch(input: {
  originalStatus: string | null;
  originalDocstatus: number | null;
  returnInvoices: Array<{ docstatus?: number | null }>;
  vaultOrder: {
    financialStatus: string | null;
    fulfillmentStage: string | null;
  } | null;
}): ErpReturnSiMismatchPattern | null {
  const hasSubmittedReturn = input.returnInvoices.some(
    (row) => row.docstatus === 1 || row.docstatus === 2,
  );
  if (!hasSubmittedReturn) return null;
  if (!isVaultOrderActiveForReturnSync(input.vaultOrder)) return null;

  const originalCreditNoted = isErpSalesInvoiceCreditNoted(
    input.originalStatus,
    input.originalDocstatus,
  );
  if (!originalCreditNoted) {
    return "return_si_original_not_credit_noted_os_active";
  }
  return "return_si_exists_os_active";
}

async function fetchErpSalesInvoice(
  creds: ErpInstanceCreds,
  invoiceName: string,
): Promise<ErpSalesInvoiceRow | null> {
  for (const variant of erpInvoiceReferenceLookupValues(invoiceName)) {
    try {
      const res = await fetch(
        `${erpBase(creds)}/api/resource/Sales Invoice/${encodeURIComponent(variant)}`,
        { headers: authHeader(creds) },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: ErpSalesInvoiceRow };
      if (json.data) return json.data;
    } catch {
      // try next variant
    }
  }
  return null;
}

async function fetchErpReturnInvoicesAgainst(
  creds: ErpInstanceCreds,
  invoiceName: string,
): Promise<ErpSalesInvoiceRow[]> {
  const seen = new Set<string>();
  const results: ErpSalesInvoiceRow[] = [];

  for (const variant of erpInvoiceReferenceLookupValues(invoiceName)) {
    try {
      const filters = encodeURIComponent(
        JSON.stringify([["return_against", "=", variant]]),
      );
      const fields = encodeURIComponent(
        JSON.stringify(["name", "docstatus", "status", "return_against", "is_return", "modified"]),
      );
      const res = await fetch(
        `${erpBase(creds)}/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit_page_length=20`,
        { headers: authHeader(creds) },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: ErpSalesInvoiceRow[] };
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

/** Inspect one original ERP invoice and linked Vault OS order. */
export async function inspectErpReturnSiMismatch(
  creds: ErpInstanceCreds,
  originalInvoiceName: string,
  vaultOrder?: {
    id: string;
    name: string | null;
    erpnextInvoiceId: string | null;
    financialStatus: string | null;
    fulfillmentStage: string;
  } | null,
): Promise<ErpReturnSiMismatch | null> {
  const trimmed = originalInvoiceName.trim();
  if (!trimmed) return null;

  const [original, returnInvoices, resolvedOrder] = await Promise.all([
    fetchErpSalesInvoice(creds, trimmed),
    fetchErpReturnInvoicesAgainst(creds, trimmed),
    vaultOrder === undefined ? findOrderForErpInvoiceReference(trimmed) : Promise.resolve(vaultOrder),
  ]);

  if (!original && returnInvoices.length === 0) return null;

  const originalStatus = typeof original?.status === "string" ? original.status : null;
  const originalDocstatus =
    typeof original?.docstatus === "number" ? original.docstatus : null;
  const originalCreditNotedInErp = erpInvoiceIndicatesCreditNote(
    { status: originalStatus, docstatus: originalDocstatus },
    returnInvoices,
  );

  const pattern = classifyErpReturnSiMismatch({
    originalStatus,
    originalDocstatus,
    returnInvoices,
    vaultOrder: resolvedOrder,
  });
  if (!pattern) return null;

  return {
    pattern,
    originalInvoiceName: trimmed,
    originalErpStatus: originalStatus,
    originalErpDocstatus: originalDocstatus,
    originalCreditNotedInErp,
    returnInvoiceNames: returnInvoices
      .map((row) => row.name?.trim())
      .filter((name): name is string => Boolean(name)),
    vaultOrder: resolvedOrder,
  };
}

/** Scan active Vault OS orders and find ERP return SIs that were not synced. */
export async function findErpReturnSiMismatchesFromVaultOrders(options?: {
  limit?: number;
  pattern?: ErpReturnSiMismatchPattern | "all";
}): Promise<ErpReturnSiMismatch[]> {
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 200);
  const patternFilter = options?.pattern ?? "all";

  const orders = await prisma.order.findMany({
    where: {
      financialStatus: { not: "voided" },
      fulfillmentStage: { not: "returned" },
      erpnextInvoiceId: { not: null },
      NOT: [{ erpnextInvoiceId: "pending" }, { erpnextInvoiceId: "pending_approval" }],
      companyLocation: { erpnextInstanceId: { not: null } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
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

  const mismatches: ErpReturnSiMismatch[] = [];

  for (const order of orders) {
    const instance = order.companyLocation?.erpnextInstance;
    const invoiceName = order.erpnextInvoiceId?.trim() || order.name?.trim();
    if (!instance || !invoiceName) continue;

    const creds: ErpInstanceCreds = {
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      apiSecret: instance.apiSecret,
    };

    const result = await inspectErpReturnSiMismatch(creds, invoiceName, {
      id: order.id,
      name: order.name,
      erpnextInvoiceId: order.erpnextInvoiceId,
      financialStatus: order.financialStatus,
      fulfillmentStage: order.fulfillmentStage,
    });

    if (!result) continue;
    if (patternFilter !== "all" && result.pattern !== patternFilter) continue;
    mismatches.push(result);
  }

  return mismatches;
}

/** Scan recent ERP return SIs and find originals still active in Vault OS. */
export async function findErpReturnSiMismatchesFromErpReturns(
  creds: ErpInstanceCreds,
  options?: {
    limit?: number;
    pattern?: ErpReturnSiMismatchPattern | "all";
  },
): Promise<ErpReturnSiMismatch[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const patternFilter = options?.pattern ?? "all";

  const filters = encodeURIComponent(
    JSON.stringify([
      ["is_return", "=", 1],
      ["docstatus", "=", 1],
      ["return_against", "!=", ""],
    ]),
  );
  const fields = encodeURIComponent(
    JSON.stringify(["name", "return_against", "status", "docstatus", "modified"]),
  );
  const res = await fetch(
    `${erpBase(creds)}/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit_page_length=${limit}&order_by=modified desc`,
    { headers: authHeader(creds) },
  );
  if (!res.ok) return [];

  const json = (await res.json()) as { data?: ErpSalesInvoiceRow[] };
  const returnRows = json.data ?? [];
  const seenOriginals = new Set<string>();
  const mismatches: ErpReturnSiMismatch[] = [];

  for (const row of returnRows) {
    const originalName = row.return_against?.trim();
    if (!originalName || seenOriginals.has(originalName)) continue;
    seenOriginals.add(originalName);

    const result = await inspectErpReturnSiMismatch(creds, originalName);
    if (!result) continue;
    if (patternFilter !== "all" && result.pattern !== patternFilter) continue;
    mismatches.push(result);
  }

  return mismatches;
}

export async function findOrderIdsMatchingErpInvoiceReference(invoiceRef: string) {
  return prisma.order.findMany({
    where: orderMatchesErpInvoiceReference(invoiceRef),
    select: {
      id: true,
      name: true,
      erpnextInvoiceId: true,
      financialStatus: true,
      fulfillmentStage: true,
    },
  });
}
