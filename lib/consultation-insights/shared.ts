import { formatAppIsoDate } from "@/lib/format-datetime";

/** Shared between the Consultation Insights page, its API routes and the Excel export. */

/** Opens the page; anyone who can open it can do everything on it. */
export const CONSULTATION_ACCESS_PERMISSION = "consultation_insights.access";

export type ConsultationMerchantKind = "merchant" | "showroom";

export type ConsultationMerchantOption = {
  /** Saved on the row as the merchant name. */
  label: string;
  kind: ConsultationMerchantKind;
  /** Showrooms: auto-pick when the order was placed at a location whose name contains this. */
  locationKeyword?: string;
};

/** The Merchant dropdown. Edit this list to add / rename / remove merchants. */
export const CONSULTATION_MERCHANT_OPTIONS: readonly ConsultationMerchantOption[] = [
  { label: "Ishadi", kind: "merchant" },
  { label: "Sachini", kind: "merchant" },
  { label: "Maheshi Priyadarshani", kind: "merchant" },
  { label: "Nirukshi", kind: "merchant" },
  { label: "Kanchana", kind: "merchant" },
  { label: "Dulshi", kind: "merchant" },
  { label: "Imandhi", kind: "merchant" },
  { label: "Sandali", kind: "merchant" },
  { label: "Venushka", kind: "merchant" },
  { label: "Showroom - Pepiliyana", kind: "showroom", locationKeyword: "pepiliyana" },
];

export function findConsultationMerchant(label: string): ConsultationMerchantOption | null {
  return CONSULTATION_MERCHANT_OPTIONS.find((option) => option.label === label.trim()) ?? null;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Dropdown label for an order: the merchant behind its coupon code (matched on full name or
 * first name, e.g. "Maheshi" → "Maheshi Priyadarshani"), otherwise a showroom by location.
 */
export function suggestConsultationMerchant(input: {
  merchantName: string | null;
  locationName: string | null;
}): string | null {
  const merchantName = input.merchantName ? normalizeName(input.merchantName) : "";
  if (merchantName) {
    const firstName = merchantName.split(" ")[0];
    const merchants = CONSULTATION_MERCHANT_OPTIONS.filter((option) => option.kind === "merchant");
    const match =
      merchants.find((option) => normalizeName(option.label) === merchantName) ??
      merchants.find((option) => normalizeName(option.label).split(" ")[0] === firstName);
    if (match) return match.label;
  }
  const location = input.locationName ? normalizeName(input.locationName) : "";
  if (location) {
    const showroom = CONSULTATION_MERCHANT_OPTIONS.find(
      (option) => option.locationKeyword && location.includes(option.locationKeyword),
    );
    if (showroom) return showroom.label;
  }
  return null;
}

/** The single merchant all the given invoices point to, or null when none / they disagree. */
export function resolveSuggestedMerchant(invoices: Array<{ suggestedMerchant: string | null }>): string | null {
  const suggestions = new Set(invoices.map((invoice) => invoice.suggestedMerchant).filter(Boolean));
  return suggestions.size === 1 ? [...suggestions][0]! : null;
}

export type ConsultationRow = {
  id: string;
  entryId: string;
  /** YYYY-MM-DD */
  consultationDate: string;
  contactNumber: string;
  invoiceNumber: string;
  customerName: string;
  merchantKind: ConsultationMerchantKind;
  merchantName: string;
  physicalReview: string;
  createdAt: string;
};

export type ConsultationInvoiceMatch = {
  invoiceNumber: string;
  /** No ERP invoice yet (still "pending" in ERP) — `invoiceNumber` is the order number. */
  isOrderNumber: boolean;
  /** Order was cancelled / voided — shown in red and cannot be added. */
  cancelled: boolean;
  /** Merchant dropdown label worked out from the order's coupon code / location, if any. */
  suggestedMerchant: string | null;
  customerName: string | null;
  locationName: string | null;
};

export type ConsultationSummary = {
  customers: number;
  invoices: number;
  reviews: number;
};

/** 10 digits starting with 0, e.g. 0771234567. */
export const CONSULTATION_PHONE_PATTERN = /^0\d{9}$/;

/** ERP sales invoice numbers look like 400-000123. */
export const CONSULTATION_INVOICE_PATTERN = /^\d{3}-\d{6}$/;

export const CONSULTATION_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentConsultationMonth(now: Date = new Date()): string {
  return formatAppIsoDate(now).slice(0, 7);
}

export function todayConsultationDate(now: Date = new Date()): string {
  return formatAppIsoDate(now);
}

export function isValidConsultationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** "2026-10" → "October 2026" */
export function formatConsultationMonth(month: string): string {
  if (!CONSULTATION_MONTH_PATTERN.test(month)) return month;
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Strips spaces / dashes so "077 123-4567" validates as 0771234567. */
export function cleanConsultationPhone(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/** "400-000438 / 600-004939" or "400-000438 600-004939" → unique, trimmed list. */
export function splitInvoiceNumbers(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[\s/,]+/)) {
    const value = part.trim().toUpperCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export type CustomerNameResolution =
  | { status: "none" }
  | { status: "resolved"; name: string }
  | { status: "ambiguous" };

/**
 * One invoice → its customer name. Several invoices → the shared name when they all
 * agree, otherwise ambiguous (the user must type the name).
 */
export function resolveCustomerName(
  invoices: Array<{ customerName: string | null }>,
): CustomerNameResolution {
  if (invoices.length === 0) return { status: "none" };
  const names = invoices.map((invoice) => invoice.customerName?.trim() ?? "");
  if (names.some((name) => !name)) {
    return invoices.length === 1 ? { status: "none" } : { status: "ambiguous" };
  }
  const distinct = new Set(names.map((name) => name.toLowerCase().replace(/\s+/g, " ")));
  return distinct.size === 1 ? { status: "resolved", name: names[0] } : { status: "ambiguous" };
}

export type ConsultationGroup = {
  entryId: string;
  /** First invoice row — carries the customer details shared by the whole group. */
  head: ConsultationRow;
  rows: ConsultationRow[];
};

/** One group per customer added, keeping the incoming row order. */
export function groupConsultations(rows: ConsultationRow[]): ConsultationGroup[] {
  const groups = new Map<string, ConsultationGroup>();
  for (const row of rows) {
    const group = groups.get(row.entryId);
    if (group) group.rows.push(row);
    else groups.set(row.entryId, { entryId: row.entryId, head: row, rows: [row] });
  }
  return [...groups.values()];
}

/** The Physical Review Update belongs to the customer, so reviews count customers with one. */
export function summarizeConsultations(rows: ConsultationRow[]): ConsultationSummary {
  const groups = groupConsultations(rows);
  return {
    customers: groups.length,
    invoices: rows.length,
    reviews: groups.filter((group) => group.head.physicalReview.trim()).length,
  };
}

/** Invoice numbers that appear on more than one row in the list. */
export function findDuplicateInvoices(rows: ConsultationRow[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.invoiceNumber.toUpperCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}
