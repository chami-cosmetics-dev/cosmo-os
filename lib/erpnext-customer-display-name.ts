import { looksLikePhoneNumber, resolveOrderCustomerName } from "@/lib/reports/csv";

export type ErpApiCreds = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

export type ErpCustomerNameSource = "webhook_customer_name" | "erp_customer_api" | "customer_id";

export type ErpCustomerNameResolution = {
  name: string;
  source: ErpCustomerNameSource;
  /** Raw `customer_name` field from the ERP webhook payload, if any. */
  webhookCustomerName: string | null;
};

export function unwrapErpWebhookPayload(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const top = rawPayload as Record<string, unknown>;
  if (top.data != null && typeof top.data === "object" && !Array.isArray(top.data)) {
    return top.data as Record<string, unknown>;
  }
  return top;
}

export function getErpWebhookCustomerNameField(rawPayload: unknown): string | null {
  const payload = unwrapErpWebhookPayload(rawPayload);
  const value = payload?.customer_name;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return null;
  return trimmed;
}

export function getErpCustomerIdFromPayload(rawPayload: unknown): string | null {
  const payload = unwrapErpWebhookPayload(rawPayload);
  const customer = payload?.customer;
  return typeof customer === "string" && customer.trim() ? customer.trim() : null;
}

export function resolveStoredOrderCustomerName(input: {
  shippingAddress?: unknown;
  billingAddress?: unknown;
  rawPayload?: unknown;
}): string | null {
  const name = resolveOrderCustomerName(input);
  return name || null;
}

/** Fetch Customer.customer_name from ERPNext when the invoice only sent the customer ID (often a phone). */
export async function fetchErpCustomerDisplayName(
  creds: ErpApiCreds,
  customerId: string,
): Promise<string | null> {
  const id = customerId.trim();
  if (!id || !creds.baseUrl || !creds.apiKey || !creds.apiSecret) return null;

  try {
    const fields = encodeURIComponent(JSON.stringify(["customer_name", "name"]));
    const res = await fetch(
      `${creds.baseUrl.replace(/\/$/, "")}/api/resource/Customer/${encodeURIComponent(id)}?fields=${fields}`,
      { headers: { Authorization: `token ${creds.apiKey}:${creds.apiSecret}` } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { customer_name?: string | null; name?: string | null } };
    const display = json.data?.customer_name?.trim();
    if (display && !looksLikePhoneNumber(display)) return display;
    return null;
  } catch {
    return null;
  }
}

/** Resolve display name for an ERP Sales Invoice webhook payload. */
export async function resolveErpWebhookCustomerName(
  data: { customer: string; customer_name?: string | null },
  creds: ErpApiCreds | null,
): Promise<ErpCustomerNameResolution> {
  const nullIfNone = (v: string | null | undefined) => {
    const s = v?.trim();
    return !s || s.toLowerCase() === "none" ? null : s;
  };

  const webhookCustomerName = nullIfNone(data.customer_name);
  if (webhookCustomerName && !looksLikePhoneNumber(webhookCustomerName)) {
    return { name: webhookCustomerName, source: "webhook_customer_name", webhookCustomerName };
  }

  if (creds) {
    const fetched = await fetchErpCustomerDisplayName(creds, data.customer);
    if (fetched) {
      return { name: fetched, source: "erp_customer_api", webhookCustomerName };
    }
  }

  return {
    name: data.customer.trim(),
    source: "customer_id",
    webhookCustomerName,
  };
}
