import { unwrapErpWebhookPayload } from "@/lib/erpnext-customer-display-name";
import { getDiscountCouponCode } from "@/lib/shopify-discount-codes";

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

/** Customer discount coupon from ERP webhook / rawPayload (e.g. SV20). */
export function getErpDiscountCouponFromPayload(rawPayload: unknown): string | null {
  const payload = unwrapErpWebhookPayload(rawPayload);
  if (!payload) return null;
  for (const key of ["coupon_code", "custom_coupon_code"] as const) {
    const value = payload[key];
    if (typeof value === "string") {
      const code = nullIfNone(value);
      if (code) return code;
    }
  }
  return null;
}

/** Discount coupon for Shopify and ERP orders (excludes MER merchant tracking codes). */
export function getOrderDiscountCouponCode(params: {
  sourceName?: string | null;
  discountCodes: unknown;
  rawPayload?: unknown;
}): string | null {
  const fromDiscountCodes = getDiscountCouponCode(params.discountCodes);
  if (fromDiscountCodes) return fromDiscountCodes;

  if (params.sourceName?.startsWith("erpnext")) {
    return getErpDiscountCouponFromPayload(params.rawPayload ?? null);
  }

  return null;
}

/** Build discountCodes JSON for ERP webhook upserts (discount + merchant codes). */
export function buildErpOrderDiscountCodes(data: {
  coupon_code?: string | null;
  custom_coupon_code?: string | null;
  custom_merchant_coupon_code?: string | null;
  merchant_coupon_code?: string | null;
}): Array<{ code: string; amount?: number }> | null {
  const rows: Array<{ code: string; amount?: number }> = [];
  const discount =
    nullIfNone(data.coupon_code) ?? nullIfNone(data.custom_coupon_code);
  const merchant =
    nullIfNone(data.custom_merchant_coupon_code) ??
    nullIfNone(data.merchant_coupon_code);

  if (discount) rows.push({ code: discount });
  if (merchant) rows.push({ code: merchant, amount: 0 });

  return rows.length > 0 ? rows : null;
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

/** Fetch customer coupon from ERP Sales Invoice when webhook data is missing. */
export async function fetchErpInvoiceDiscountCoupon(
  creds: ErpApiCreds,
  invoiceName: string,
): Promise<string | null> {
  const ref = invoiceName.trim();
  if (!ref) return null;

  const fields = encodeURIComponent(JSON.stringify(["coupon_code", "custom_coupon_code"]));
  const row = await erpGet<{ coupon_code?: string | null; custom_coupon_code?: string | null }>(
    creds,
    `/api/resource/Sales Invoice/${encodeURIComponent(ref)}?fields=${fields}`,
  );
  if (!row) return null;

  return nullIfNone(row.coupon_code) ?? nullIfNone(row.custom_coupon_code);
}

/** Resolve discount coupon from stored data, falling back to live ERP invoice lookup. */
export async function resolveOrderDiscountCouponForOrder(input: {
  sourceName?: string | null;
  discountCodes: unknown;
  rawPayload?: unknown;
  name?: string | null;
  erpnextInvoiceId?: string | null;
  erpnextInstance?: ErpInstanceLike;
}): Promise<string | null> {
  const stored = getOrderDiscountCouponCode(input);
  if (stored) return stored;

  const source = input.sourceName?.toLowerCase() ?? "";
  if (!source.startsWith("erpnext")) return null;

  const creds = resolveErpApiCreds(input.erpnextInstance ?? null);
  const invoiceRef = resolveErpInvoiceRef(input);
  if (!creds || !invoiceRef) return null;

  return fetchErpInvoiceDiscountCoupon(creds, invoiceRef);
}
