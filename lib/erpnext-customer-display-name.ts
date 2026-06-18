import {
  isValidCustomerDisplayName,
  looksLikeErpCustomerId,
  resolveOrderCustomerName,
} from "@/lib/reports/csv";
import { prisma } from "@/lib/prisma";

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

function getCustomerIdFromAddress(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const name = (address as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function resolveErpCustomerIdForLookup(input: {
  rawPayload?: unknown;
  shippingAddress?: unknown;
}): string | null {
  return (
    getErpCustomerIdFromPayload(input.rawPayload) ??
    getCustomerIdFromAddress(input.shippingAddress)
  );
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
    if (display && isValidCustomerDisplayName(display)) return display;
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
  if (webhookCustomerName && isValidCustomerDisplayName(webhookCustomerName)) {
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

/** Live ERP lookup for list rows where stored data only has a customer ID (phone or numeric). */
export async function enrichErpOrderCustomerNames(
  orders: Array<{
    id: string;
    sourceName: string;
    shippingAddress: unknown;
    rawPayload: unknown;
    companyLocationId: string;
  }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const erpOrders = orders.filter(
    (o) => o.sourceName === "erpnext" || o.sourceName === "erpnext-pos",
  );
  if (erpOrders.length === 0) return result;

  const locationIds = [...new Set(erpOrders.map((o) => o.companyLocationId))];
  const locations = await prisma.companyLocation.findMany({
    where: { id: { in: locationIds } },
    select: {
      id: true,
      erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } },
    },
  });
  const credsByLocation = new Map(
    locations.map((l) => [
      l.id,
      l.erpnextInstance?.baseUrl && l.erpnextInstance.apiKey && l.erpnextInstance.apiSecret
        ? {
            baseUrl: l.erpnextInstance.baseUrl,
            apiKey: l.erpnextInstance.apiKey,
            apiSecret: l.erpnextInstance.apiSecret,
          }
        : null,
    ]),
  );

  const fetchCache = new Map<string, string | null>();

  await Promise.all(
    erpOrders.map(async (order) => {
      const creds = credsByLocation.get(order.companyLocationId);
      if (!creds) return;

      const customerId = resolveErpCustomerIdForLookup(order);
      if (!customerId || !looksLikeErpCustomerId(customerId)) return;

      const cacheKey = `${creds.baseUrl}:${customerId}`;
      let name = fetchCache.get(cacheKey);
      if (name === undefined) {
        name = await fetchErpCustomerDisplayName(creds, customerId);
        fetchCache.set(cacheKey, name);
      }
      if (name) result.set(order.id, name);
    }),
  );

  return result;
}
