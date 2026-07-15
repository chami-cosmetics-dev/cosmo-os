import { unwrapErpWebhookPayload } from "@/lib/erpnext-customer-display-name";
import { shouldResolveFromLinkedErpInvoice } from "@/lib/erp-order-link";

type ErpInstanceLike = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
} | null;

type ErpApiCreds = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

function nullIfNone(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return null;
  return trimmed;
}

/** Special Remarks from ERP Sales Invoice webhook / rawPayload. */
export function getErpSpecialRemarksFromPayload(rawPayload: unknown): string | null {
  const payload = unwrapErpWebhookPayload(rawPayload);
  if (!payload) return null;
  for (const key of ["custom_special_remarks", "special_remarks"] as const) {
    const value = payload[key];
    if (typeof value === "string") {
      const text = nullIfNone(value);
      if (text) return text;
    }
  }
  return null;
}

function resolveErpApiCreds(instance: ErpInstanceLike): ErpApiCreds | null {
  const baseUrl = (instance?.baseUrl ?? process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, "");
  const apiKey = instance?.apiKey ?? process.env.ERPNEXT_API_KEY ?? "";
  const apiSecret = instance?.apiSecret ?? process.env.ERPNEXT_API_SECRET ?? "";
  if (!baseUrl || !apiKey || !apiSecret) return null;
  return { baseUrl, apiKey, apiSecret };
}

function resolveErpInvoiceRef(input: {
  name?: string | null;
  erpnextInvoiceId?: string | null;
  rawPayload?: unknown;
}): string | null {
  const payload = unwrapErpWebhookPayload(input.rawPayload);
  const fromPayload = typeof payload?.name === "string" ? payload.name : null;
  for (const candidate of [input.erpnextInvoiceId, input.name, fromPayload]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

async function erpGet<T>(creds: ErpApiCreds, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${creds.baseUrl}${path}`, {
      headers: { Authorization: `token ${creds.apiKey}:${creds.apiSecret}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch Special Remarks from a linked ERP Sales Invoice. */
export async function fetchErpInvoiceSpecialRemarks(
  creds: ErpApiCreds,
  invoiceName: string,
): Promise<string | null> {
  const ref = invoiceName.trim();
  if (!ref) return null;

  const fields = encodeURIComponent(
    JSON.stringify(["custom_special_remarks", "special_remarks"]),
  );
  const row = await erpGet<{
    custom_special_remarks?: string | null;
    special_remarks?: string | null;
  }>(creds, `/api/resource/Sales Invoice/${encodeURIComponent(ref)}?fields=${fields}`);

  if (!row) return null;
  return nullIfNone(row.custom_special_remarks) ?? nullIfNone(row.special_remarks);
}

/** Resolve ERP Special Remarks from payload, with live SI lookup when linked. */
export async function resolveOrderErpSpecialRemarksForOrder(input: {
  sourceName?: string | null;
  rawPayload?: unknown;
  name?: string | null;
  erpnextInvoiceId?: string | null;
  erpnextInstance?: ErpInstanceLike;
}): Promise<string | null> {
  const stored = getErpSpecialRemarksFromPayload(input.rawPayload ?? null);

  if (!shouldResolveFromLinkedErpInvoice(input)) {
    return stored;
  }

  const creds = resolveErpApiCreds(input.erpnextInstance ?? null);
  const invoiceRef = resolveErpInvoiceRef(input);
  if (!creds || !invoiceRef) return stored;

  const fromErp = await fetchErpInvoiceSpecialRemarks(creds, invoiceRef);
  return fromErp ?? stored;
}
