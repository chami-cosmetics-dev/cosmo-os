import { unwrapErpWebhookPayload } from "@/lib/erpnext-customer-display-name";

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

type ErpPayloadItem = {
  item_code?: string | null;
  qty?: number | null;
  rate?: number | null;
  amount?: number | null;
  price_list_rate?: number | null;
  discount_amount?: number | null;
};

type ErpApiItemRow = {
  item_code?: string | null;
  qty?: number | null;
  rate?: number | null;
  amount?: number | null;
  price_list_rate?: number | null;
  discount_amount?: number | null;
};

export type OrderLineItemPricing = {
  salePrice: string;
  saleTotal: string;
  originalPrice: string | null;
  originalTotal: string | null;
  lineDiscount: string | null;
};

function toMoney(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function readErpPayloadItems(rawPayload: unknown): ErpPayloadItem[] {
  const payload = unwrapErpWebhookPayload(rawPayload);
  if (!payload || !Array.isArray(payload.items)) return [];
  return payload.items.filter((row): row is ErpPayloadItem => !!row && typeof row === "object");
}

function resolveFromErpRow(
  row: ErpPayloadItem | ErpApiItemRow,
  quantity: number,
): OrderLineItemPricing {
  const qty = quantity > 0 ? quantity : 1;
  const saleUnit = row.rate ?? (row.amount != null ? row.amount / qty : 0);
  const saleTotal = row.amount ?? saleUnit * qty;

  const listRate = row.price_list_rate ?? null;
  const lineDiscount = row.discount_amount ?? null;

  let originalUnit: number | null = null;
  if (listRate != null && listRate > saleUnit) {
    originalUnit = listRate;
  } else if (lineDiscount != null && lineDiscount > 0) {
    originalUnit = saleUnit + lineDiscount / qty;
  }

  const originalTotal =
    originalUnit != null && originalUnit > saleUnit ? originalUnit * qty : null;

  return {
    salePrice: toMoney(saleUnit) ?? "0.00",
    saleTotal: toMoney(saleTotal) ?? "0.00",
    originalPrice: originalUnit != null && originalUnit > saleUnit ? toMoney(originalUnit) : null,
    originalTotal: originalTotal != null ? toMoney(originalTotal) : null,
    lineDiscount:
      lineDiscount != null && lineDiscount > 0
        ? toMoney(lineDiscount)
        : originalTotal != null
          ? toMoney(originalTotal - saleTotal)
          : null,
  };
}

function matchErpItemRow(
  rows: ErpPayloadItem[],
  sku: string | null | undefined,
  index: number,
): ErpPayloadItem | null {
  if (sku) {
    const bySku = rows.find((row) => row.item_code?.trim() === sku.trim());
    if (bySku) return bySku;
  }
  return rows[index] ?? null;
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

export async function fetchErpInvoiceItemPricing(
  creds: ErpApiCreds,
  invoiceName: string,
): Promise<ErpApiItemRow[]> {
  const ref = invoiceName.trim();
  if (!ref) return [];

  const row = await erpGet<{ items?: ErpApiItemRow[] }>(
    creds,
    `/api/resource/Sales Invoice/${encodeURIComponent(ref)}`,
  );
  return Array.isArray(row?.items) ? row.items : [];
}

export function sumLineDiscounts(items: OrderLineItemPricing[]): string | null {
  let total = 0;
  let hasDiscount = false;
  for (const item of items) {
    const n = item.lineDiscount != null ? parseFloat(item.lineDiscount) : 0;
    if (Number.isFinite(n) && n > 0) {
      total += n;
      hasDiscount = true;
    }
  }
  return hasDiscount ? total.toFixed(2) : null;
}

export function sumOriginalTotals(items: OrderLineItemPricing[]): string | null {
  let total = 0;
  let hasOriginal = false;
  for (const item of items) {
    const n = item.originalTotal != null ? parseFloat(item.originalTotal) : parseFloat(item.saleTotal);
    if (Number.isFinite(n)) {
      total += n;
      if (item.originalTotal != null) hasOriginal = true;
    }
  }
  return hasOriginal ? total.toFixed(2) : null;
}

export async function resolveOrderLineItemsPricing(input: {
  sourceName?: string | null;
  rawPayload?: unknown;
  name?: string | null;
  erpnextInvoiceId?: string | null;
  erpnextInstance?: ErpInstanceLike;
  lineItems: Array<{ sku: string | null; quantity: number; price: string }>;
}): Promise<OrderLineItemPricing[]> {
  const source = input.sourceName?.toLowerCase() ?? "";
  const isErp = source.startsWith("erpnext");

  let erpRows = isErp ? readErpPayloadItems(input.rawPayload) : [];
  const needsLive =
    isErp &&
    (erpRows.length === 0 ||
      erpRows.some((row) => row.price_list_rate == null && row.discount_amount == null));

  if (needsLive) {
    const creds = resolveErpApiCreds(input.erpnextInstance ?? null);
    const invoiceRef = resolveErpInvoiceRef(input);
    if (creds && invoiceRef) {
      const live = await fetchErpInvoiceItemPricing(creds, invoiceRef);
      if (live.length > 0) erpRows = live;
    }
  }

  return input.lineItems.map((li, index) => {
    if (isErp) {
      const row = matchErpItemRow(erpRows, li.sku, index);
      if (row) return resolveFromErpRow(row, li.quantity);
    }

    const saleUnit = parseFloat(li.price);
    const saleTotal = saleUnit * li.quantity;
    return {
      salePrice: Number.isFinite(saleUnit) ? saleUnit.toFixed(2) : li.price,
      saleTotal: Number.isFinite(saleTotal) ? saleTotal.toFixed(2) : li.price,
      originalPrice: null,
      originalTotal: null,
      lineDiscount: null,
    };
  });
}

export function resolveOrderDiscountTotal(input: {
  totalDiscounts?: string | null;
  linePricing: OrderLineItemPricing[];
  discountCouponCode?: string | null;
}): string | null {
  const stored = input.totalDiscounts?.trim();
  if (stored && parseFloat(stored) > 0) return stored;
  if (!input.discountCouponCode) return null;
  return sumLineDiscounts(input.linePricing);
}
