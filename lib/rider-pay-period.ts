import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";

export type PayPeriodKind = "current" | "previous";

export type PayPeriodWindow = {
  kind: PayPeriodKind;
  from: Date;
  to: Date;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Last calendar day of year/month (month 1–12), Asia/Colombo months. */
export function lastDayOfCalendarMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function monthWindow(year: number, month1to12: number): { from: Date; to: Date } {
  const last = lastDayOfCalendarMonth(year, month1to12);
  const from = parseAppCalendarDayStart(`${year}-${pad2(month1to12)}-01`);
  const to = parseAppCalendarDayEnd(`${year}-${pad2(month1to12)}-${pad2(last)}`);
  if (!from || !to) {
    throw new Error(`Invalid calendar month ${year}-${month1to12}`);
  }
  return { from, to };
}

/**
 * Rider pay period = Asia/Colombo calendar month (1st → last day of that month).
 * `current` = month containing referenceDate; `previous` = month before that.
 */
export function resolvePayPeriodWindow(
  kind: PayPeriodKind,
  referenceDate: Date = new Date()
): PayPeriodWindow {
  const ymd = formatAppIsoDate(referenceDate);
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));

  if (kind === "current") {
    const { from, to } = monthWindow(year, month);
    return { kind: "current", from, to };
  }

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const { from, to } = monthWindow(prevYear, prevMonth);
  return { kind: "previous", from, to };
}
