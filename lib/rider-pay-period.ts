import { addDays, endOfDay, startOfDay } from "@/lib/mobile/dates";

export type PayPeriodKind = "current" | "previous";

export type PayPeriodWindow = {
  kind: PayPeriodKind;
  from: Date;
  to: Date;
};

const MIN_DAY = 1;
const MAX_DAY = 31;

export function isValidPaydayDayOfMonth(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_DAY && value <= MAX_DAY;
}

/** Day-of-month clamped to the last day of that calendar month (e.g. 31 in Feb → 28/29). */
export function clampDayToMonth(year: number, monthIndex: number, dayOfMonth: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(dayOfMonth, MIN_DAY), lastDay);
}

export function dateOnPaydayInMonth(year: number, monthIndex: number, paydayDayOfMonth: number): Date {
  const day = clampDayToMonth(year, monthIndex, paydayDayOfMonth);
  return startOfDay(new Date(year, monthIndex, day));
}

/** Most recent payday on or before `ref` (local), respecting each month’s length. */
export function mostRecentPaydayOnOrBefore(ref: Date, paydayDayOfMonth: number): Date {
  const day = startOfDay(ref);
  const thisMonth = dateOnPaydayInMonth(day.getFullYear(), day.getMonth(), paydayDayOfMonth);
  if (thisMonth.getTime() <= day.getTime()) {
    return thisMonth;
  }
  const prev = new Date(day.getFullYear(), day.getMonth() - 1, 1);
  return dateOnPaydayInMonth(prev.getFullYear(), prev.getMonth(), paydayDayOfMonth);
}

export function resolvePayPeriodWindow(
  paydayDayOfMonth: number | null | undefined,
  kind: PayPeriodKind,
  referenceDate: Date = new Date()
): PayPeriodWindow | null {
  if (!isValidPaydayDayOfMonth(paydayDayOfMonth)) {
    return null;
  }

  const currentStart = mostRecentPaydayOnOrBefore(referenceDate, paydayDayOfMonth);
  const nextMonthAnchor = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 1);
  const nextStart = dateOnPaydayInMonth(
    nextMonthAnchor.getFullYear(),
    nextMonthAnchor.getMonth(),
    paydayDayOfMonth
  );
  const currentEnd = endOfDay(addDays(startOfDay(nextStart), -1));

  if (kind === "current") {
    return { kind: "current", from: currentStart, to: currentEnd };
  }

  const previousStart = mostRecentPaydayOnOrBefore(addDays(currentStart, -1), paydayDayOfMonth);
  const previousEnd = endOfDay(addDays(currentStart, -1));
  return { kind: "previous", from: previousStart, to: previousEnd };
}
