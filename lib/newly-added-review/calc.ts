/**
 * Newly Added Priority Review (monthly mail): which variant SKUs have been "Newly Added" long
 * enough to need a decision (Top / Low / Discontinue). Pure, client-safe.
 *
 * Month rule: an item stays Newly Added for 3 full months after its created month; the month
 * the mail goes is never counted. So the mail for month M lists items created in M-4 or earlier
 * (November mail → created July or earlier). Duration = calendar months from the created month
 * to the mail month (July → November = 4).
 */

import { stockHealthStatusOf } from "@/lib/stock-health/calc";

/** Full months an item stays Newly Added before it needs a decision. */
export const NEWLY_ADDED_MONTHS = 3;
/** Duration (months) from which an item is in "Needs Priority Check": 3 full months + the mail month. */
export const NEEDS_CHECK_MIN_MONTHS = NEWLY_ADDED_MONTHS + 1;

export const NEWLY_ADDED_STATUS = "Newly Added" as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "YYYY-MM" from "YYYY-MM-DD" (or "YYYY-MM"); null when not a date. */
export function monthKeyOf(ymd: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(ymd ?? "");
  return m ? `${m[1]}-${m[2]}` : null;
}

function monthIndex(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** "2026-11" → "November 2026". */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Calendar months from the created month to the mail month (same month = 0; never negative). */
export function durationMonths(createdYmd: string, mailMonth: string): number {
  const created = monthKeyOf(createdYmd);
  if (!created) return 0;
  return Math.max(0, monthIndex(mailMonth) - monthIndex(created));
}

/** The latest created month that is in the mail for `mailMonth` (M-4): "2026-11" → "2026-07". */
export function lastIncludedCreatedMonth(mailMonth: string): string {
  const i = monthIndex(mailMonth) - NEEDS_CHECK_MIN_MONTHS;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** "2026-07" + n months → "2026-09". */
function addMonths(monthKey: string, n: number): string {
  const i = monthIndex(monthKey) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/**
 * Max Sale Qty (Sheet 1): Sales Budget's Highest Sale Qty rule — the most units sold in any one
 * completed calendar month (months without sales = 0) — over the item's Newly Added life: its
 * created month up to the month before the mail (the mail month is never counted). That is
 * exactly `durationMonths` months (created June, November mail → June–October = 5).
 */
export function maxSaleQtyInWindow(
  unitsByMonth: ReadonlyMap<string, number> | undefined,
  createdYmd: string,
  mailMonth: string,
): number {
  const created = monthKeyOf(createdYmd);
  if (!created || !unitsByMonth) return 0;
  let best = 0;
  for (let m = created; m < mailMonth; m = addMonths(m, 1)) best = Math.max(best, unitsByMonth.get(m) ?? 0);
  return best;
}

/** One catalog variant with its Item Trends created date and live stock. */
export type NewlyAddedReviewInput = {
  sku: string;
  productTitle: string | null;
  /** Resolved ERP Product Priority (ERP1, else ERP2) — as on Item Trends. */
  priority: string | null;
  /** Item Trends created date (earliest stock-in across every warehouse / ERP), or null. */
  createdDate: string | null;
  currentStock: number;
};

export type NewlyAddedReviewRow = {
  sku: string;
  productTitle: string | null;
  priorityStatus: typeof NEWLY_ADDED_STATUS;
  createdDate: string | null;
  /** null when there is no created date. */
  durationMonths: number | null;
  currentStock: number;
  /** Sheet 1 only: Max Sale Qty (maxSaleQtyInWindow); null elsewhere. */
  maxSaleQty: number | null;
};

export type NewlyAddedReview = {
  /** "YYYY-MM": the month the mail goes. */
  mailMonth: string;
  /** Sheet 1: Newly Added for 3 full months or more (created M-4 or earlier). */
  needsCheck: NewlyAddedReviewRow[];
  /** Sheet 2: every item currently Newly Added (Sheet 1's included). */
  all: NewlyAddedReviewRow[];
  /** The mail's table: Sheet 1 per created month, oldest first. */
  byCreatedMonth: Array<{ month: string; count: number }>;
};

/** Oldest created date first; no created date last; then SKU. */
function byCreatedDate(a: NewlyAddedReviewRow, b: NewlyAddedReviewRow): number {
  if (a.createdDate !== b.createdDate) {
    if (a.createdDate === null) return 1;
    if (b.createdDate === null) return -1;
    return a.createdDate.localeCompare(b.createdDate);
  }
  return a.sku.localeCompare(b.sku);
}

/**
 * `unitsByMonth(sku)`: the variant's counted units per "YYYY-MM" (all channels), for Sheet 1's
 * Max Sale Qty; omitted → 0.
 */
export function buildNewlyAddedReview(
  items: NewlyAddedReviewInput[],
  mailMonth: string,
  unitsByMonth: (sku: string) => ReadonlyMap<string, number> | undefined = () => undefined,
): NewlyAddedReview {
  const all: NewlyAddedReviewRow[] = items
    .filter((item) => stockHealthStatusOf(item.priority) === NEWLY_ADDED_STATUS)
    .map((item) => ({
      sku: item.sku,
      productTitle: item.productTitle,
      priorityStatus: NEWLY_ADDED_STATUS,
      createdDate: item.createdDate,
      durationMonths: item.createdDate ? durationMonths(item.createdDate, mailMonth) : null,
      currentStock: item.currentStock,
      maxSaleQty: null as number | null,
    }))
    .sort(byCreatedDate);

  // No created date = unknown age, so not listed as needing a decision (still in Sheet 2).
  const needsCheck = all
    .filter((row) => row.durationMonths !== null && row.durationMonths >= NEEDS_CHECK_MIN_MONTHS)
    .map((row) => ({ ...row, maxSaleQty: maxSaleQtyInWindow(unitsByMonth(row.sku), row.createdDate!, mailMonth) }));

  const counts = new Map<string, number>();
  for (const row of needsCheck) {
    const month = monthKeyOf(row.createdDate)!;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const byCreatedMonth = [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return { mailMonth, needsCheck, all, byCreatedMonth };
}

/** NEWLY_ADDED_REVIEW_MAIL_RECIPIENTS: comma / semicolon / space separated; invalid entries dropped. */
export function parseReviewRecipients(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !seen.has(e) && (seen.add(e), true));
}

/**
 * Send day: the first Tuesday of each month (Asia/Colombo), 9:00 AM — the cron runs every
 * Tuesday and only that day sends. A month listed here goes on its own date instead.
 */
export const NEWLY_ADDED_REVIEW_SEND_DATE_OVERRIDES: Readonly<Record<string, string>> = {
  // First mail: November 2026's first Tuesday (3rd) had passed when it was built.
  "2026-11": "2026-11-24",
};

/** 0 = Sunday … 2 = Tuesday, for a "YYYY-MM-DD" calendar day. */
function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/** "YYYY-MM-DD" of the month's first Tuesday. */
export function firstTuesdayOf(monthKey: string): string {
  for (let day = 1; day <= 7; day += 1) {
    const ymd = `${monthKey}-${String(day).padStart(2, "0")}`;
    if (weekdayOf(ymd) === 2) return ymd;
  }
  throw new Error(`No Tuesday in the first week of ${monthKey}`);
}

/** The day the mail for `monthKey` goes: its override, else the first Tuesday. */
export function newlyAddedReviewSendDate(monthKey: string): string {
  return NEWLY_ADDED_REVIEW_SEND_DATE_OVERRIDES[monthKey] ?? firstTuesdayOf(monthKey);
}
