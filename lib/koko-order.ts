import { APP_TIME_ZONE } from "@/lib/format-datetime";

/** Lookback for KOKO duplicate grouping and soft notices (calendar days). */
export const KOKO_DUPLICATE_LOOKBACK_DAYS = 30;

export const FINANCE_CANCEL_KOKO_DUPLICATE_PERMISSION =
  "finance.approvals.cancel_koko_duplicate" as const;

const ERP_SOURCE_PREFIXES = ["erpnext", "erpnext-pos", "pos"] as const;

export function isErpSourcedOrder(sourceName: string | null | undefined): boolean {
  const s = (sourceName ?? "").trim().toLowerCase();
  if (!s) return false;
  return (
    s === "erpnext" ||
    s.startsWith("erpnext") ||
    s === "pos" ||
    ERP_SOURCE_PREFIXES.some((p) => s === p)
  );
}

/** True when payment primary (preferred) or names indicate KOKO. */
export function isKokoPaymentGateway(order: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}): boolean {
  const primary = order.paymentGatewayPrimary?.toLowerCase().trim();
  if (primary) return primary.includes("koko");
  const names = (order.paymentGatewayNames ?? [])
    .map((g) => g.toLowerCase().trim())
    .filter(Boolean);
  return names.some((g) => g.includes("koko"));
}

/** ERP-sourced KOKO orders use deferred finance approval until link time is confirmed. */
export function isErpKokoOrder(order: {
  sourceName?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}): boolean {
  return isErpSourcedOrder(order.sourceName) && isKokoPaymentGateway(order);
}

export function needsKokoLinkTimeConfirm(order: {
  sourceName?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  kokoLinkTimeConfirmedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  financialStatus?: string | null;
}): boolean {
  if (!isErpKokoOrder(order)) return false;
  if (order.cancelledAt) return false;
  if ((order.financialStatus ?? "").toLowerCase() === "voided") return false;
  return order.kokoLinkTimeConfirmedAt == null;
}

export function canEditKokoLinkTime(order: {
  sourceName?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  cancelledAt?: Date | string | null;
  financialStatus?: string | null;
  paymentApprovalStatus?: string | null;
}): boolean {
  if (!isErpKokoOrder(order)) return false;
  if (order.cancelledAt) return false;
  if ((order.financialStatus ?? "").toLowerCase() === "voided") return false;
  if (order.paymentApprovalStatus === "approved") return false;
  return true;
}

/**
 * Parse merchant-entered ISO datetime (or datetime-local) as Asia/Colombo wall time
 * when no offset is present; otherwise use the given instant.
 */
export function parseKokoLinkGeneratedAt(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // datetime-local: YYYY-MM-DDTHH:mm (no zone) → treat as Colombo
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (localMatch) {
    const [, y, mo, d, h, mi, se] = localMatch;
    // Wall clock in Asia/Colombo → UTC (Sri Lanka is GMT+5:30 year-round).
    const offsetMinutes = 5 * 60 + 30;
    const utcMs =
      Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(se ?? "0"),
      ) -
      offsetMinutes * 60_000;
    const date = new Date(utcMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCSeconds(0, 0);
  return date;
}

/** datetime-local value (YYYY-MM-DDTHH:mm) in Asia/Colombo for an instant. */
export function toColomboDateTimeLocalValue(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
