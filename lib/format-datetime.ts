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

/** YYYY-MM-DD in Asia/Colombo (invoices, PDF dates, filters, "today" stamps). */
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

/** YYYY-MM-DD → start of that calendar day in Asia/Colombo. */
export function parseAppCalendarDayStart(
  ymd: string | null | undefined,
): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const date = new Date(`${ymd}T00:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * YYYY-MM-DD for date-only DB fields (UTC midnight / calendar day).
 * Use for HTML date inputs and exports of returnDate, DOB, batchDate, etc.
 */
export function formatAppIsoCalendarDate(
  value: string | Date | null | undefined,
  fallback = "",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Legacy date-only values were stored as UTC midnight (shows as 5:30 AM in Colombo).
 * Remap those to Colombo midnight so display shows local wall time; real timestamps pass through.
 */
export function coerceLegacyUtcMidnightToAppInstant(
  value: string | Date | null | undefined,
): Date | null {
  const date = toValidDate(value);
  if (!date) return null;
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  if (!isUtcMidnight) return date;
  const ymd = formatAppIsoCalendarDate(date);
  return ymd ? new Date(`${ymd}T00:00:00+05:30`) : date;
}

/** Date + time in Asia/Colombo, including legacy UTC-midnight date-only fields. */
export function formatAppStoredDateTime(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  return formatAppDateTime(coerceLegacyUtcMidnightToAppInstant(value), fallback);
}

/** YYYY-MM-DD HH:mm:ss in Asia/Colombo (CSV / report timestamps). */
export function formatAppIsoDateTime(
  value: string | Date | null | undefined,
  fallback = "",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

/** HH:mm:ss.SSS in Asia/Colombo (order-dump time columns). */
export function formatAppIsoTime(
  value: string | Date | null | undefined,
  fallback = "",
): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${hour}:${get("minute")}:${get("second")}.${ms}`;
}
