import { shouldResolveFromLinkedErpInvoice } from "@/lib/erp-order-link";

type ErpTaxRow = {
  description?: string | null;
  tax_amount?: number | null;
  account_head?: string | null;
};

type ErpApiCreds = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

type ErpInstanceLike = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
} | null;

type ShippingLineRow = {
  title?: string | null;
  code?: string | null;
  price?: string | number | null;
  discounted_price?: string | number | null;
  source?: string | null;
};

export type OrderShippingDisplay = {
  label: string | null;
  amount: string | null;
};

function parseAmount(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

function unwrapErpPayload(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const top = rawPayload as Record<string, unknown>;
  if (top.data && typeof top.data === "object" && !Array.isArray(top.data)) {
    return top.data as Record<string, unknown>;
  }
  return top;
}

function readShippingLines(shippingLines: unknown): ShippingLineRow[] {
  if (!Array.isArray(shippingLines)) return [];
  return shippingLines.filter((row): row is ShippingLineRow => !!row && typeof row === "object");
}

function extractErpShippingFromPayload(rawPayload: unknown): OrderShippingDisplay {
  const payload = unwrapErpPayload(rawPayload);
  if (!payload) return { label: null, amount: null };

  const rule = typeof payload.shipping_rule === "string" ? payload.shipping_rule.trim() : "";
  const taxes = Array.isArray(payload.taxes) ? (payload.taxes as ErpTaxRow[]) : [];

  let amount: string | null = null;
  if (rule) {
    const matched = taxes.find((tax) => tax.description?.trim() === rule);
    amount = parseAmount(matched?.tax_amount ?? null);
  }
  if (!amount) {
    const shippingTax = taxes.find(
      (tax) =>
        /shipping|delivery/i.test(tax.account_head ?? "") ||
        /shipping|delivery/i.test(tax.description ?? ""),
    );
    amount = parseAmount(shippingTax?.tax_amount ?? null);
  }
  if (!amount && typeof payload.total_taxes_and_charges === "number" && payload.total_taxes_and_charges > 0) {
    amount = payload.total_taxes_and_charges.toFixed(2);
  }

  return {
    label: rule || null,
    amount,
  };
}

/** Resolve ERP shipping rule label + charge for order detail displays. */
export function resolveOrderShippingDisplay(input: {
  totalShipping?: string | number | null;
  shippingLines?: unknown;
  rawPayload?: unknown;
  sourceName?: string | null;
}): OrderShippingDisplay {
  const storedAmount = parseAmount(input.totalShipping ?? null);

  const lines = readShippingLines(input.shippingLines);
  if (lines.length > 0) {
    const primary = lines[0];
    const label = (primary.title ?? primary.code ?? "").trim() || null;
    const lineAmount =
      parseAmount(primary.discounted_price ?? null) ?? parseAmount(primary.price ?? null);
    return {
      label,
      amount: storedAmount ?? lineAmount,
    };
  }

  const source = input.sourceName?.toLowerCase() ?? "";
  if (source === "erpnext" || source === "erpnext-pos") {
    const erp = extractErpShippingFromPayload(input.rawPayload);
    return {
      label: erp.label,
      amount: storedAmount ?? erp.amount,
    };
  }

  return {
    label: null,
    amount: storedAmount,
  };
}

/** Build shippingLines JSON + totalShipping for ERP webhook upserts. */
export function buildErpOrderShippingFields(data: {
  shipping_rule?: string | null;
  taxes?: ErpTaxRow[];
  total_taxes_and_charges?: number | null;
}): {
  totalShipping: string | null;
  shippingLines: Array<{ title: string; code: string; price: string; source: "erpnext" }> | null;
} {
  const label = data.shipping_rule?.trim() ?? "";
  const display = extractErpShippingFromPayload({
    shipping_rule: label || null,
    taxes: data.taxes ?? [],
    total_taxes_and_charges: data.total_taxes_and_charges ?? null,
  });

  if (!label && !display.amount) {
    return { totalShipping: null, shippingLines: null };
  }

  const resolvedLabel = label || display.label || "Delivery";
  const amount = display.amount;

  return {
    totalShipping: amount,
    shippingLines: [
      {
        title: resolvedLabel,
        code: resolvedLabel,
        price: amount ?? "0",
        source: "erpnext",
      },
    ],
  };
}

export function formatOrderShippingDetail(
  display: OrderShippingDisplay,
  formatPrice: (amount: string, currency?: string | null) => string,
  currency?: string | null,
): string | null {
  const label = display.label?.trim();
  const amount = display.amount != null ? parseFloat(display.amount) : 0;
  const hasAmount = Number.isFinite(amount) && amount > 0;

  if (!label && !hasAmount) return null;
  if (label && hasAmount) return `${label} (${formatPrice(display.amount!, currency)})`;
  if (label) return label;
  return `Shipping: ${formatPrice(display.amount!, currency)}`;
}

/**
 * Grand total for order summaries when shipping is listed on its own line.
 * Some stored totals match the discounted subtotal only; add shipping when needed.
 */
export function resolveOrderDisplayTotal(input: {
  totalPrice: string;
  subtotalSale?: string | null;
  totalShipping?: string | null;
}): string {
  const stored = parseFloat(input.totalPrice);
  if (!Number.isFinite(stored)) return input.totalPrice;

  const shippingParsed = parseFloat(input.totalShipping ?? "0");
  const shippingAmt =
    Number.isFinite(shippingParsed) && shippingParsed > 0 ? shippingParsed : 0;
  if (shippingAmt === 0) return stored.toFixed(2);

  const saleParsed = parseFloat(input.subtotalSale ?? input.totalPrice);
  const saleAmt = Number.isFinite(saleParsed) ? saleParsed : stored;
  const withShipping = saleAmt + shippingAmt;

  if (stored >= withShipping - 0.01) return stored.toFixed(2);
  if (Math.abs(stored - saleAmt) < 0.01) return withShipping.toFixed(2);

  return stored.toFixed(2);
}

function resolveErpInvoiceRef(input: {
  name?: string | null;
  erpnextInvoiceId?: string | null;
  rawPayload?: unknown;
}): string | null {
  const payload = unwrapErpPayload(input.rawPayload);
  const fromPayload = typeof payload?.name === "string" ? payload.name : null;
  for (const candidate of [input.erpnextInvoiceId, input.name, fromPayload]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
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

/** Fetch shipping rule + delivery charge from ERP Sales Invoice API. */
export async function fetchErpInvoiceShippingDisplay(
  creds: ErpApiCreds,
  invoiceName: string,
): Promise<OrderShippingDisplay> {
  const ref = invoiceName.trim();
  if (!ref) return { label: null, amount: null };

  const fields = encodeURIComponent(JSON.stringify(["shipping_rule", "total_taxes_and_charges"]));
  const row = await erpGet<{ shipping_rule?: string | null; total_taxes_and_charges?: number | null }>(
    creds,
    `/api/resource/Sales Invoice/${encodeURIComponent(ref)}?fields=${fields}`,
  );
  if (!row) return { label: null, amount: null };

  return {
    label: row.shipping_rule?.trim() || null,
    amount: parseAmount(row.total_taxes_and_charges ?? null),
  };
}

export function mergeOrderShippingDisplay(
  stored: OrderShippingDisplay,
  live: OrderShippingDisplay,
): OrderShippingDisplay {
  return {
    label: stored.label ?? live.label,
    amount: stored.amount ?? live.amount,
  };
}

/** Resolve shipping display from stored data, falling back to live ERP invoice lookup. */
export async function resolveOrderShippingDisplayForOrder(input: {
  totalShipping?: string | number | null;
  shippingLines?: unknown;
  rawPayload?: unknown;
  sourceName?: string | null;
  name?: string | null;
  erpnextInvoiceId?: string | null;
  erpnextInstance?: ErpInstanceLike;
}): Promise<OrderShippingDisplay> {
  const stored = resolveOrderShippingDisplay(input);
  const needsLabel = !stored.label?.trim();
  const needsAmount = !stored.amount;
  if (!needsLabel && !needsAmount) return stored;

  if (!shouldResolveFromLinkedErpInvoice(input)) return stored;

  const creds = resolveErpApiCreds(input.erpnextInstance ?? null);
  const invoiceRef = resolveErpInvoiceRef(input);
  if (!creds || !invoiceRef) return stored;

  const live = await fetchErpInvoiceShippingDisplay(creds, invoiceRef);
  return mergeOrderShippingDisplay(stored, live);
}
