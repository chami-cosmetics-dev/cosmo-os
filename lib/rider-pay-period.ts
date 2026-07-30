import { addDays, endOfDay, startOfDay } from "@/lib/mobile/dates";

export type PayPeriodKind = "current" | "previous";

export type PayPeriodWindow = {
  kind: PayPeriodKind;
  from: Date;
  to: Date;
};

const MIN_DAY = 1;
const MAX_DAY = 28;

export function isValidPaydayDayOfMonth(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_DAY && value <= MAX_DAY;
}

/** Most recent calendar date with day-of-month `D` on or before `ref` (local). */
export function mostRecentPaydayOnOrBefore(ref: Date, paydayDayOfMonth: number): Date {
  const day = startOfDay(ref);
  const candidate = new Date(day);
  candidate.setDate(paydayDayOfMonth);
  if (candidate.getTime() <= day.getTime()) {
    return startOfDay(candidate);
  }
  const prevMonth = new Date(day);
  prevMonth.setDate(1);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  prevMonth.setDate(paydayDayOfMonth);
  return startOfDay(prevMonth);
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
  const nextStart = new Date(currentStart);
  nextStart.setMonth(nextStart.getMonth() + 1);
  nextStart.setDate(paydayDayOfMonth);
  const currentEnd = endOfDay(addDays(startOfDay(nextStart), -1));

  if (kind === "current") {
    return { kind: "current", from: currentStart, to: currentEnd };
  }

  const previousStart = mostRecentPaydayOnOrBefore(addDays(currentStart, -1), paydayDayOfMonth);
  const previousEnd = endOfDay(addDays(currentStart, -1));
  return { kind: "previous", from: previousStart, to: previousEnd };
}
