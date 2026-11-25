/**
 * Checks run on an uploaded Search Console export before anything is extracted (Shopify Draft
 * tab), in order: (1) the file was created today (Sri Lanka time), (2) it is the expected report
 * (Filters, Pages, Chart). The first failure stops the upload. Pure, client-safe.
 */

import { formatAppIsoDate } from "@/lib/format-datetime";
import { EXPECTED_SEARCH_CONSOLE_FILTERS } from "@/lib/discontinued-items/search-console";

export type ReportCheck = { ok: true } | { ok: false; error: string };

/** "Last 3 months" is 89–92 days depending on the months; this allows a little either side. */
export const CHART_DAYS_MIN = 85;
export const CHART_DAYS_MAX = 95;
/** Search Console data lags: the Chart's last day must be this many days before today. */
export const CHART_END_MIN_DAYS_AGO = 1;
export const CHART_END_MAX_DAYS_AGO = 4;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** YYYY-MM-DD → "20 Nov 2026". */
export function displayDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Whole days from date key `a` to `b` (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** The workbook's "created" property as a valid Date, else null. */
export function fileCreatedDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Check 1: the file's created date (workbook properties) is today in Sri Lanka time. */
export function checkReportCreatedToday(created: Date | null, now: Date = new Date()): ReportCheck {
  if (!created) {
    return {
      ok: false,
      error:
        "This file has no created date, so it can't be confirmed as today's export. Export the report " +
        "again from Search Console and upload the downloaded file.",
    };
  }
  const createdDay = formatAppIsoDate(created);
  const today = formatAppIsoDate(now);
  if (createdDay !== today) {
    return {
      ok: false,
      error:
        `This report was created on ${displayDay(createdDay)}, not today (${displayDay(today)}). ` +
        "Export a new report from Search Console today and upload that file.",
    };
  }
  return { ok: true };
}

/** A Chart "Date" cell as YYYY-MM-DD: text "2026-08-18", an Excel date number, or a Date. */
function chartDayKey(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 20_000) {
    // Excel day number (when the file was re-saved with real dates); day 0 = 1899-12-30.
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * DAY_MS).toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

/**
 * Check 2: it is the expected report. Filters sheet: Search type Web, Date Last 3 months,
 * Country Sri Lanka, Page containing /products. Pages sheet: a "Top pages" column. Chart sheet:
 * about 90 days, ending 1 to 4 days before today (Sri Lanka time).
 */
export function checkReportContents(sheets: Record<string, unknown[][]>, now: Date = new Date()): ReportCheck {
  const fail = (reason: string): ReportCheck => ({ ok: false, error: `Report check failed: ${reason}` });
  const names = Object.keys(sheets);
  const sheetNamed = (name: string) => names.find((n) => norm(n) === name);

  // Filters
  const filtersName = sheetNamed("filters");
  if (!filtersName) {
    return fail("the file has no Filters sheet. Upload the Search Console Performance export as Excel.");
  }
  const filters = new Map<string, string>();
  for (const row of sheets[filtersName].slice(1)) {
    const name = norm(row?.[0]);
    if (name) filters.set(name, String(row?.[1] ?? "").trim());
  }
  const wrong: string[] = [];
  for (const f of EXPECTED_SEARCH_CONSOLE_FILTERS) {
    const value = filters.get(norm(f.name));
    if (!value) wrong.push(`filter "${f.name}" is not set (expected ${f.expected})`);
    else if (!f.matches(value)) wrong.push(`filter "${f.name}" is "${value}" (expected ${f.expected})`);
  }
  if (wrong.length > 0) return fail(`${wrong.join("; ")}.`);

  // Pages
  const pagesName = sheetNamed("pages");
  if (!pagesName) return fail("the file has no Pages sheet.");
  if (!(sheets[pagesName][0] ?? []).some((c) => norm(c) === "top pages")) {
    return fail('the Pages sheet has no "Top pages" column.');
  }

  // Chart
  const chartName = sheetNamed("chart");
  const chart = chartName ? sheets[chartName] : null;
  const dateCol = chart ? (chart[0] ?? []).findIndex((c) => norm(c) === "date") : -1;
  const days = chart && dateCol >= 0
    ? chart.slice(1).map((row) => chartDayKey(row?.[dateCol])).filter((d): d is string => d !== null).sort()
    : [];
  if (days.length === 0) return fail("the file has no Chart sheet with dates.");
  const first = days[0];
  const last = days[days.length - 1];
  const span = daysBetween(first, last) + 1;
  if (span < CHART_DAYS_MIN || span > CHART_DAYS_MAX) {
    return fail(
      `the Chart covers ${span} days (${displayDay(first)} to ${displayDay(last)}); expected about 90 (Last 3 months).`,
    );
  }
  const today = formatAppIsoDate(now);
  const endsAgo = daysBetween(last, today);
  if (endsAgo < CHART_END_MIN_DAYS_AGO || endsAgo > CHART_END_MAX_DAYS_AGO) {
    const when = endsAgo <= 0 ? (endsAgo === 0 ? "today" : "after today") : `${endsAgo} days before today`;
    return fail(
      `the Chart ends on ${displayDay(last)}, ${when}; expected ${CHART_END_MIN_DAYS_AGO} to ` +
        `${CHART_END_MAX_DAYS_AGO} days before today.`,
    );
  }
  return { ok: true };
}
