import { formatAppIsoDate } from "@/lib/format-datetime";

export const STALE_DAYS_THRESHOLD = 14;

/**
 * Parses YYYY-MM-DD into a UTC date for day-diff calculations.
 */
function parseYmdToUtcDays(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
}

/**
 * Checks if a competitor price verification date is stale (> 14 days old).
 * Evaluated relative to Asia/Colombo today date or optional `asOf` reference.
 */
export function isPriceCheckStale(
  checkDate: string | Date | null | undefined,
  asOf?: string | Date | null,
): boolean {
  if (!checkDate) return false;

  const checkYmd =
    typeof checkDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(checkDate)
      ? checkDate
      : formatAppIsoDate(checkDate);

  if (!checkYmd) return false;

  const asOfYmd = asOf ? (typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : formatAppIsoDate(asOf)) : formatAppIsoDate(new Date());

  const checkDays = parseYmdToUtcDays(checkYmd);
  const asOfDays = parseYmdToUtcDays(asOfYmd);

  if (checkDays == null || asOfDays == null) return false;

  return asOfDays - checkDays > STALE_DAYS_THRESHOLD;
}
