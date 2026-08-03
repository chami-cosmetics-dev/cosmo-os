import { formatAppIsoDate } from "@/lib/format-datetime";

export const DAY_LOCKED_CODE = "DAY_LOCKED" as const;

/** True when postingDate (YYYY-MM-DD) equals today in Asia/Colombo. */
export function isBookNoteWritable(
  postingDateYmd: string,
  now: Date = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDateYmd)) return false;
  const today = formatAppIsoDate(now);
  return Boolean(today) && postingDateYmd === today;
}

/** Merchant may only write today; past and future are locked. */
export function isBookNoteDayLocked(
  postingDateYmd: string,
  now: Date = new Date(),
): boolean {
  return !isBookNoteWritable(postingDateYmd, now);
}
