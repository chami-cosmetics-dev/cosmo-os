import {
  isValidCustomerDisplayName,
  looksLikeErpCustomerId,
  resolveOrderCustomerName,
} from "@/lib/reports/csv";
import { buildPhoneLookupVariants, canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";
import { LIMITS } from "@/lib/validation";
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

type ErpInstanceLike = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
} | null;

export function resolveErpApiCreds(instance: ErpInstanceLike): ErpApiCreds | null {
  const baseUrl = (instance?.baseUrl ?? process.env.ERPNEXT_BASE_URL ?? "").replace(/\/$/, "");
  const apiKey = instance?.apiKey ?? process.env.ERPNEXT_API_KEY ?? "";
  const apiSecret = instance?.apiSecret ?? process.env.ERPNEXT_API_SECRET ?? "";
  if (!baseUrl || !apiKey || !apiSecret) return null;
  return { baseUrl, apiKey, apiSecret };
}

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
  return isValidCustomerDisplayName(trimmed) ? trimmed : null;
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

export function collectErpCustomerIdCandidates(input: {
  rawPayload?: unknown;
  shippingAddress?: unknown;
}): string[] {
  const ids = [
    getErpCustomerIdFromPayload(input.rawPayload),
    getCustomerIdFromAddress(input.shippingAddress),
  ].filter((id): id is string => !!id?.trim());
  return [...new Set(ids.map((id) => id.trim()))];
}

export function resolveErpCustomerIdForLookup(input: {
  rawPayload?: unknown;
  shippingAddress?: unknown;
}): string | null {
  return collectErpCustomerIdCandidates(input)[0] ?? null;
}

function resolveErpInvoiceRef(input: {
  name?: string | null;
  erpnextInvoiceId?: string | null;
  rawPayload?: unknown;
}): string | null {
  const fromPayload = unwrapErpWebhookPayload(input.rawPayload)?.name;
  const candidates = [input.erpnextInvoiceId, input.name, typeof fromPayload === "string" ? fromPayload : null];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function resolveStoredOrderCustomerName(input: {
  shippingAddress?: unknown;
  billingAddress?: unknown;
  rawPayload?: unknown;
}): string | null {
  const fromWebhook = getErpWebhookCustomerNameField(input.rawPayload);
  if (fromWebhook) return fromWebhook;
  const name = resolveOrderCustomerName(input);
  return name || null;
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

async function fetchErpCustomerByPhone(
  creds: ErpApiCreds,
  phone: string,
): Promise<string | null> {
  const phoneVariants = buildPhoneLookupVariants(phone.trim())
    .slice(0, 20)
    .map((v) => v.slice(0, LIMITS.mobile.max));
  if (phoneVariants.length === 0) return null;

  const phoneFilter = encodeURIComponent(JSON.stringify([["mobile_no", "in", phoneVariants]]));
  const fields = encodeURIComponent(JSON.stringify(["name", "customer_name"]));
  const rows = await erpGet<Array<{ name: string; customer_name: string }>>(
    creds,
    `/api/resource/Customer?filters=${phoneFilter}&fields=${fields}&limit=1`,
  );
  const display = rows?.[0]?.customer_name?.trim();
  if (display && isValidCustomerDisplayName(display)) return display;
  return null;
}

/** Fetch Customer.customer_name from ERPNext by document name / phone ID. */
export async function fetchErpCustomerDisplayName(
  creds: ErpApiCreds,
  customerId: string,
): Promise<string | null> {
  const id = customerId.trim();
  if (!id || !creds.baseUrl || !creds.apiKey || !creds.apiSecret) return null;

  const fields = encodeURIComponent(JSON.stringify(["customer_name", "name"]));
  const row = await erpGet<{ customer_name?: string | null; name?: string | null }>(
    creds,
    `/api/resource/Customer/${encodeURIComponent(id)}?fields=${fields}`,
  );
  const display = row?.customer_name?.trim();
  if (display && isValidCustomerDisplayName(display)) return display;

  if (looksLikeErpCustomerId(id)) {
    return fetchErpCustomerByPhone(creds, id);
  }

  return null;
}

async function fetchErpInvoiceCustomerDisplayName(
  creds: ErpApiCreds,
  invoiceName: string,
): Promise<string | null> {
  const ref = invoiceName.trim();
  if (!ref) return null;

  const fields = encodeURIComponent(JSON.stringify(["customer_name", "customer"]));
  const row = await erpGet<{ customer_name?: string | null; customer?: string | null }>(
    creds,
    `/api/resource/Sales Invoice/${encodeURIComponent(ref)}?fields=${fields}`,
  );

  const fromInvoice = row?.customer_name?.trim();
  if (fromInvoice && isValidCustomerDisplayName(fromInvoice)) return fromInvoice;

  const customerId = row?.customer?.trim();
  if (customerId) {
    return fetchErpCustomerDisplayName(creds, customerId);
  }

  return null;
}

/** Live ERP lookup: webhook payload → Sales Invoice → Customer master. */
export async function resolveErpCustomerNameLive(
  creds: ErpApiCreds,
  input: {
    rawPayload?: unknown;
    shippingAddress?: unknown;
    name?: string | null;
    erpnextInvoiceId?: string | null;
  },
): Promise<string | null> {
  const fromWebhook = getErpWebhookCustomerNameField(input.rawPayload);
  if (fromWebhook) return fromWebhook;

  const invoiceRef = resolveErpInvoiceRef(input);
  if (invoiceRef) {
    const fromInvoice = await fetchErpInvoiceCustomerDisplayName(creds, invoiceRef);
    if (fromInvoice) return fromInvoice;
  }

  for (const customerId of collectErpCustomerIdCandidates(input)) {
    const fromCustomer = await fetchErpCustomerDisplayName(creds, customerId);
    if (fromCustomer) return fromCustomer;

    const phoneId = canonicalPhoneForErpCustomerId(customerId);
    if (phoneId && phoneId !== customerId) {
      const fromPhoneId = await fetchErpCustomerDisplayName(creds, phoneId);
      if (fromPhoneId) return fromPhoneId;
    }
  }

  return null;
}

/** Resolve display name for an ERP Sales Invoice webhook payload. */
export async function resolveErpWebhookCustomerName(
  data: { name: string; customer: string; customer_name?: string | null },
  creds: ErpApiCreds | null,
): Promise<ErpCustomerNameResolution> {
  const nullIfNone = (v: string | null | undefined) => {
    const s = v?.trim();
    return !s || s.toLowerCase() === "none" ? null : s;
  };

  const webhookCustomerName = nullIfNone(data.customer_name);

  if (creds) {
    const live = await resolveErpCustomerNameLive(creds, {
      rawPayload: data,
      name: data.name,
      erpnextInvoiceId: data.name,
    });
    if (live) {
      return {
        name: live,
        source: webhookCustomerName && live === webhookCustomerName ? "webhook_customer_name" : "erp_customer_api",
        webhookCustomerName,
      };
    }
  }

  if (webhookCustomerName && isValidCustomerDisplayName(webhookCustomerName)) {
    return { name: webhookCustomerName, source: "webhook_customer_name", webhookCustomerName };
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
    name: string | null;
    erpnextInvoiceId: string | null;
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
    locations.map((l) => [l.id, resolveErpApiCreds(l.erpnextInstance)] as const),
  );

  const fetchCache = new Map<string, string | null>();
  const persistUpdates: Array<{ id: string; shippingAddress: unknown; name: string }> = [];

  await Promise.all(
    erpOrders.map(async (order) => {
      const creds = credsByLocation.get(order.companyLocationId);
      if (!creds) return;

      const invoiceRef = resolveErpInvoiceRef(order) ?? order.id;
      const cacheKey = `${creds.baseUrl}:${invoiceRef}`;
      let name = fetchCache.get(cacheKey);
      if (name === undefined) {
        name = await resolveErpCustomerNameLive(creds, order);
        fetchCache.set(cacheKey, name);
      }
      if (name) {
        result.set(order.id, name);
        persistUpdates.push({ id: order.id, shippingAddress: order.shippingAddress, name });
      }
    }),
  );

  if (persistUpdates.length > 0) {
    await Promise.all(
      persistUpdates.map(({ id, shippingAddress, name }) => {
        const addr =
          shippingAddress && typeof shippingAddress === "object" && !Array.isArray(shippingAddress)
            ? { ...(shippingAddress as Record<string, unknown>), name }
            : { name };
        return prisma.order.update({
          where: { id },
          data: { shippingAddress: addr },
        });
      }),
    );
  }

  return result;
}
