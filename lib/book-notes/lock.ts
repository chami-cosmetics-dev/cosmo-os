import { formatAppIsoDate } from "@/lib/format-datetime";

export const DAY_LOCKED_CODE = "DAY_LOCKED" as const;

/**
 * Merchants may save/send any sales date on or before today (Asia/Colombo).
 * Future dates are locked.
 */
export function isBookNoteWritable(
  postingDateYmd: string,
  now: Date = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDateYmd)) return false;
  const today = formatAppIsoDate(now);
  if (!today) return false;
  return postingDateYmd <= today;
}

/** True when posting date is in the future (Asia/Colombo). */
export function isBookNoteDayLocked(
  postingDateYmd: string,
  now: Date = new Date(),
): boolean {
  return !isBookNoteWritable(postingDateYmd, now);
}
