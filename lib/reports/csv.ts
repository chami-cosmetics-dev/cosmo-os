import { formatFulfillmentOrderReferenceText } from "@/lib/fulfillment-order-reference";

export type CsvPrimitive = string | number | null | undefined;

export function escapeCsvCell(value: CsvPrimitive) {
  const normalized = value == null ? "" : String(value);
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function formatCsvHeader(header: string) {
  return header === "shipping_rule" ? "SHIPPING RULE" : header.toUpperCase();
}

export function buildCsv<T extends Record<string, CsvPrimitive>>(
  headers: readonly string[],
  rows: T[]
) {
  const lines = [
    headers.map(formatCsvHeader).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export function formatIsoDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export function formatIsoDateTime(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().replace("T", " ");
}

export function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

export function getAddressField(address: unknown, field: string) {
  if (!address || typeof address !== "object") return "";
  const record = address as Record<string, unknown>;
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
}

export function getCustomerName(address: unknown) {
  const name = getAddressField(address, "name");
  if (name) return name;

  const first = getAddressField(address, "first_name");
  const last = getAddressField(address, "last_name");
  return [first, last].filter(Boolean).join(" ").trim();
}

export function looksLikePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return false;
  return /^[+]?[\d\s().-]+$/.test(trimmed);
}

/** ERP customer document IDs are often numeric (e.g. 0000717) or phone numbers — not display names. */
export function looksLikeErpCustomerId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (looksLikePhoneNumber(trimmed)) return true;
  return /^\d+$/.test(trimmed);
}

export function isValidCustomerDisplayName(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 && !looksLikeErpCustomerId(trimmed);
}

/** Customer display name for waybills — never falls back to phone or email. */
export function resolveOrderCustomerName(input: {
  shippingAddress?: unknown;
  billingAddress?: unknown;
  rawPayload?: unknown;
}) {
  const candidates = [
    getCustomerName(input.shippingAddress),
    getCustomerName(input.billingAddress),
  ];

  if (input.rawPayload && typeof input.rawPayload === "object") {
    const payload = input.rawPayload as Record<string, unknown>;
    const erpPayload =
      payload.data != null && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : payload;
    const erpCustomerName = erpPayload.customer_name;
    if (typeof erpCustomerName === "string" && erpCustomerName.trim()) {
      candidates.unshift(erpCustomerName.trim());
    }
    const customer = payload.customer ?? erpPayload.customer;
    if (customer && typeof customer === "object") {
      candidates.push(getCustomerName(customer));
      const defaultAddress = (customer as Record<string, unknown>).default_address;
      if (defaultAddress) {
        candidates.push(getCustomerName(defaultAddress));
      }
    }
    if (payload.shipping_address) {
      candidates.push(getCustomerName(payload.shipping_address));
    }
    if (payload.billing_address) {
      candidates.push(getCustomerName(payload.billing_address));
    }
  }

  for (const candidate of candidates) {
    const name = candidate.trim();
    if (name && isValidCustomerDisplayName(name)) {
      return name;
    }
  }

  return "";
}

export function isPlaceholderErpInvoiceId(id: string | null | undefined) {
  return !id || id === "pending" || id === "pending_approval";
}

export function formatDispatchOrderReference(order: {
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
  erpnextInvoiceId?: string | null;
}) {
  return formatFulfillmentOrderReferenceText(order);
}

export function formatAddress(address: unknown) {
  const parts = [
    getAddressField(address, "address1"),
    getAddressField(address, "address2"),
    [getAddressField(address, "city"), getAddressField(address, "province_code")].filter(Boolean).join(", "),
    getAddressField(address, "country"),
    getAddressField(address, "zip"),
  ].filter(Boolean);

  return parts.join(", ");
}
