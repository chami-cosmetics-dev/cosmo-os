import { CALL_CENTER_CATEGORY_VALUES } from "@/lib/contact-call-center-categories";

const PERMANENT_OMIT = new Set<string>(["Black List", "Wrong Number"]);
const NOT_RESPONDING = "Not Responding";

export function addCalendarMonthsUtc(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const day = from.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return new Date(
    Date.UTC(
      year,
      month,
      clampedDay,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds()
    )
  );
}

/** Eligible again at UTC start of calendar day `days` later (Mon + 7 → next Mon 00:00 UTC). */
export function eligibleAtStartOfUtcDayAfter(from: Date, days: number): Date {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days)
  );
  return d;
}

export type CallQueueHideInput = {
  now: Date;
  currentCategory: string | null | undefined;
  allocationAt: Date | null;
  lastNonAllocationAt: Date | null;
  lastNonAllocationCategory: string | null | undefined;
  hasPendingQueue: boolean;
};

/** Short label when hide rules apply; null when eligible to assign. */
export function callQueueHideReason(input: CallQueueHideInput): string | null {
  const category = (input.currentCategory ?? "").trim();
  if (PERMANENT_OMIT.has(category)) return category;
  if (input.hasPendingQueue) return "Already queued";

  if (input.allocationAt && input.now < addCalendarMonthsUtc(input.allocationAt, 2)) {
    return "Allocated < 2 months";
  }

  const lastAt = input.lastNonAllocationAt;
  const lastCat = (input.lastNonAllocationCategory ?? "").trim();
  if (!lastAt || !lastCat) return null;

  if (lastCat === NOT_RESPONDING) {
    return input.now < eligibleAtStartOfUtcDayAfter(lastAt, 7)
      ? "Not Responding (7 days)"
      : null;
  }

  if (PERMANENT_OMIT.has(lastCat)) return lastCat;

  return input.now < addCalendarMonthsUtc(lastAt, 2)
    ? `${lastCat} (< 2 months)`
    : null;
}

export function isHiddenFromCallQueueAssign(input: CallQueueHideInput): boolean {
  return callQueueHideReason(input) != null;
}

export function isCallCenterTemplateCategory(value: string): boolean {
  return (CALL_CENTER_CATEGORY_VALUES as readonly string[]).includes(value);
}
