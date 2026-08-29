import { isRealErpSalesInvoiceId } from "@/lib/approval-workflow";
import { companyLabelForLocation } from "@/lib/book-notes/serialize";
import {
  extractErpErrorMessage,
  type BookNoteErpFailCode,
} from "@/lib/book-notes/erp-verify";
import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { getErpConfig } from "@/lib/erpnext-sync";
import { prisma } from "@/lib/prisma";
import type { ErpnextInstance } from "@prisma/client";

/** ERP Server Script API method for ss16_sync_koko_orders.py (override via env). */
export function getKokoOrderSyncMethod(): string {
  return (
    process.env.ERPNEXT_KOKO_ORDER_SYNC_METHOD?.trim() ||
    "bank_recon_sync_koko_orders"
  );
}

export type KokoOrderErpSyncRowInput = {
  sales_invoice: string;
  koko_reference: string;
  amount: number;
  customer: string;
  requested_time: string;
  reviewed_by: string;
  company: string;
};

export type KokoOrderErpSyncResultRow = {
  docname?: string;
  order_id?: string | null;
  sales_invoice?: string;
  payment_entry?: string | null;
  amount?: number;
  customer?: string;
  status?: string;
  error?: string;
};

export type KokoOrderErpSyncResult = {
  ok: boolean;
  method: string;
  company: string;
  erpUrl?: string;
  verifiedCount: number;
  totalCount: number;
  results: KokoOrderErpSyncResultRow[];
  rawMessage: unknown;
  error?: string;
  code?: BookNoteErpFailCode;
  httpStatus?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function classifyErpFailure(
  httpStatus: number,
  message: string,
): BookNoteErpFailCode {
  const low = message.toLowerCase();
  if (
    httpStatus === 404 ||
    low.includes("not found") ||
    low.includes("does not exist") ||
    (low.includes("method") && low.includes("not"))
  ) {
    return "ERP_METHOD_MISSING";
  }
  if (httpStatus >= 400) return "ERP_SCRIPT_ERROR";
  return "ERP_HTTP";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function customerLabelForKokoOrder(order: {
  customerPhone: string | null;
  shippingAddress: unknown;
}): string {
  const phone = order.customerPhone?.trim();
  if (phone) return phone;

  const addr = asRecord(order.shippingAddress);
  const addrPhone = typeof addr?.phone === "string" ? addr.phone.trim() : "";
  if (addrPhone) return addrPhone;

  const first =
    typeof addr?.first_name === "string" ? addr.first_name.trim() : "";
  const last = typeof addr?.last_name === "string" ? addr.last_name.trim() : "";
  return [first, last].filter(Boolean).join(" ").trim();
}

export function buildKokoOrderErpRow(input: {
  salesInvoice: string;
  kokoReference: string;
  amount: number;
  customer: string;
  requestedAt: Date;
  reviewedBy: string;
  company: string;
}): KokoOrderErpSyncRowInput {
  return {
    sales_invoice: input.salesInvoice.trim(),
    koko_reference: input.kokoReference.trim(),
    amount: roundMoney(input.amount),
    customer: input.customer.trim(),
    requested_time: formatAppIsoDateTime(input.requestedAt),
    reviewed_by: input.reviewedBy.trim(),
    company: input.company.trim(),
  };
}

function parseSyncResults(message: unknown): {
  verifiedCount: number;
  totalCount: number;
  results: KokoOrderErpSyncResultRow[];
} {
  const root = asRecord(message);
  const results = Array.isArray(root?.results)
    ? (root.results as KokoOrderErpSyncResultRow[])
    : [];
  return {
    verifiedCount:
      typeof root?.verified_count === "number" ? root.verified_count : 0,
    totalCount: typeof root?.total_count === "number" ? root.total_count : results.length,
    results,
  };
}

/**
 * Push KOKO order verification rows to ERP ss16 sync Server Script.
 * Script expects form_dict rows_json with:
 *   sales_invoice, koko_reference, amount, customer, requested_time, reviewed_by, company
 */
export async function sendKokoOrdersToErp(input: {
  erpnextInstance: ErpnextInstance | null;
  rows: KokoOrderErpSyncRowInput[];
}): Promise<KokoOrderErpSyncResult> {
  const cfg = getErpConfig(input.erpnextInstance);
  const method = getKokoOrderSyncMethod();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const erpUrl = base ? `${base}/api/method/${method}` : undefined;
  const company = input.rows[0]?.company ?? "";

  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    return {
      ok: false,
      method,
      company,
      erpUrl,
      verifiedCount: 0,
      totalCount: 0,
      results: [],
      rawMessage: null,
      code: "ERP_CREDENTIALS_MISSING",
      error:
        "ERP credentials missing for this shop. Link an ErpnextInstance (base URL, API key, API secret) to the shop location in Cosmo settings.",
    };
  }

  if (input.rows.length === 0) {
    return {
      ok: false,
      method,
      company,
      erpUrl,
      verifiedCount: 0,
      totalCount: 0,
      results: [],
      rawMessage: null,
      code: "NO_ROWS",
      error: "No KOKO order rows to send to ERP",
    };
  }

  const rows_json = JSON.stringify(
    input.rows.map((row) => ({
      invoice: row.sales_invoice,
      sales_invoice: row.sales_invoice,
      koko_reference: row.koko_reference,
      order_id: row.koko_reference,
      amount: row.amount,
      customer: row.customer,
      requested: row.requested_time,
      requested_time: row.requested_time,
      reviewed_by: row.reviewed_by,
      company: row.company,
    })),
  );

  const body = new URLSearchParams({ rows_json });

  let res: Response;
  try {
    res = await fetch(erpUrl!, {
      method: "POST",
      headers: {
        Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      method,
      company,
      erpUrl,
      verifiedCount: 0,
      totalCount: 0,
      results: [],
      rawMessage: null,
      code: "NETWORK",
      error: `Could not reach ERP at ${erpUrl}: ${detail}`,
    };
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }

  if (!res.ok) {
    const msg = extractErpErrorMessage(parsed, res.status, text);
    const code = classifyErpFailure(res.status, msg);
    const hint =
      code === "ERP_METHOD_MISSING"
        ? ` Create Server Script (API) with api_method="${method}" and paste ss16_sync_koko_orders.py.`
        : "";
    return {
      ok: false,
      method,
      company,
      erpUrl,
      verifiedCount: 0,
      totalCount: 0,
      results: [],
      rawMessage: parsed,
      code,
      httpStatus: res.status,
      error: `${msg}${hint}`,
    };
  }

  const message =
    typeof parsed === "object" && parsed && "message" in parsed
      ? (parsed as { message: unknown }).message
      : parsed;
  const { verifiedCount, totalCount, results } = parseSyncResults(message);

  if (!Array.isArray(asRecord(message)?.results) && results.length === 0) {
    return {
      ok: false,
      method,
      company,
      erpUrl,
      verifiedCount: 0,
      totalCount: 0,
      results: [],
      rawMessage: message,
      code: "ERP_UNKNOWN",
      httpStatus: res.status,
      error:
        `ERP returned 200 but no { results } from ${method}. Check the Server Script sets frappe.response['message'] = { results, ... }.`,
    };
  }

  return {
    ok: true,
    method,
    company,
    erpUrl,
    verifiedCount,
    totalCount,
    results,
    rawMessage: message,
  };
}

export async function syncKokoOrdersForApproval(input: {
  orderId: string;
  entries: Array<{ reference: string; amount: number }>;
  requestedAt: Date;
  reviewedById: string;
}): Promise<KokoOrderErpSyncResult> {
  if (input.entries.length === 0) {
    return {
      ok: false,
      method: getKokoOrderSyncMethod(),
      company: "",
      verifiedCount: 0,
      totalCount: 0,
      results: [],
      rawMessage: null,
      code: "NO_ROWS",
      error: "No KOKO order rows to send to ERP",
    };
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      erpnextInvoiceId: true,
      customerPhone: true,
      shippingAddress: true,
      companyLocation: {
        select: {
          name: true,
          erpnextCompany: true,
          erpnextInstance: true,
        },
      },
    },
  });

  if (!order?.companyLocation) {
    return {
      ok: false,
      method: getKokoOrderSyncMethod(),
      company: "",
      verifiedCount: 0,
      totalCount: 0,
      results: [],
      rawMessage: null,
      code: "NO_ROWS",
      error: "Order has no company location — cannot sync KOKO order to ERP",
    };
  }

  const salesInvoice = order.erpnextInvoiceId?.trim() ?? "";
  if (!isRealErpSalesInvoiceId(salesInvoice)) {
    return {
      ok: false,
      method: getKokoOrderSyncMethod(),
      company: companyLabelForLocation(order.companyLocation),
      verifiedCount: 0,
      totalCount: 0,
      results: [],
      rawMessage: null,
      code: "NO_ROWS",
      error: "ERP Sales Invoice is not ready — cannot sync KOKO order to ERP",
    };
  }

  const reviewer = await prisma.user.findUnique({
    where: { id: input.reviewedById },
    select: { email: true, name: true },
  });
  const reviewedBy =
    reviewer?.name?.trim() || reviewer?.email?.trim() || input.reviewedById;

  const company = companyLabelForLocation(order.companyLocation);
  const customer = customerLabelForKokoOrder(order);

  const rows = input.entries.map((entry) =>
    buildKokoOrderErpRow({
      salesInvoice,
      kokoReference: entry.reference,
      amount: entry.amount,
      customer,
      requestedAt: input.requestedAt,
      reviewedBy,
      company,
    }),
  );

  return sendKokoOrdersToErp({
    erpnextInstance: order.companyLocation.erpnextInstance,
    rows,
  });
}

/**
 * @deprecated Prefer syncKokoOrdersForApproval with one or more entries.
 */
export async function syncKokoOrderForApproval(input: {
  orderId: string;
  kokoReference: string;
  amount: number;
  requestedAt: Date;
  reviewedById: string;
}): Promise<KokoOrderErpSyncResult> {
  return syncKokoOrdersForApproval({
    orderId: input.orderId,
    entries: [{ reference: input.kokoReference, amount: input.amount }],
    requestedAt: input.requestedAt,
    reviewedById: input.reviewedById,
  });
}
