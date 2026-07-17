/** Business timezone for Vault OS + Cosmo OS (Sri Lanka). */
export const APP_TIME_ZONE = "Asia/Colombo";
export const APP_LOCALE = "en-LK";

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Full date + time in Asia/Colombo (e.g. order created, approvals, ERP failures). */
export function formatAppDateTime(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  return date.toLocaleString(APP_LOCALE, { timeZone: APP_TIME_ZONE });
}

/** Compact date + time in Asia/Colombo. */
export function formatAppDateTimeShort(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  return date.toLocaleString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Calendar day in Asia/Colombo from an instant (timestamps). */
export function formatAppDate(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

/**
 * Date-only DB fields stored as UTC midnight / YYYY-MM-DD
 * (returnDate, handoverDate, batchDate). Format in UTC so the calendar day does not shift.
 */
export function formatAppCalendarDate(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

/** Calendar day in Asia/Colombo with short month (e.g. print queue). */
export function formatAppDateShort(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Time only in Asia/Colombo. */
export function formatAppTime(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  return date.toLocaleTimeString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** YYYY-MM-DD in Asia/Colombo (invoices, PDF dates, filters). */
export function formatAppIsoDate(
  value: string | Date | null | undefined,
  fallback = "",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
