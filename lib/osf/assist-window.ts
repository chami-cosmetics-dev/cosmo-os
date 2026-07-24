/**
 * Assist sales window + suggested ROP (Option A = sales in window).
 * Pure helpers — no I/O.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse YYYY-MM-DD; returns null if invalid. */
export function parseIsoDate(value: string | null | undefined): string | null {
  const s = (value ?? "").trim();
  if (!ISO_DATE.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return s;
}

/** Add calendar days to YYYY-MM-DD (UTC date arithmetic). */
export function addUtcDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  const d = new Date(t + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Colombo-midnight UTC instant for a calendar YYYY-MM-DD (UTC+5:30 year-round).
 * Matches monthly-sales month bound style.
 */
export function colomboDayStartUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, -5, -30, 0, 0));
}

export type AssistWindow = {
  /** Inclusive start date (YYYY-MM-DD) for display */
  windowStart: string;
  /** Inclusive as-of end date (YYYY-MM-DD) for display */
  windowEnd: string;
  /** Exclusive end instant for DB queries */
  rangeStart: Date;
  rangeEndExclusive: Date;
  usedPurchaseDate: boolean;
};

/**
 * Resolve assist sales window.
 * - Valid lastPurchaseDate <= asOf → purchase → asOf
 * - Missing / invalid / future purchase → last 30 days → asOf
 */
export function resolveAssistWindow(input: {
  asOfDate: string;
  lastPurchaseDate: string | null | undefined;
}): AssistWindow {
  const asOf = parseIsoDate(input.asOfDate);
  if (!asOf) {
    throw new Error(`Invalid asOfDate: ${input.asOfDate}`);
  }

  const purchase = parseIsoDate(input.lastPurchaseDate ?? null);
  let windowStart: string;
  let usedPurchaseDate = false;

  if (purchase && purchase <= asOf) {
    windowStart = purchase;
    usedPurchaseDate = true;
  } else {
    windowStart = addUtcDays(asOf, -30);
  }

  return {
    windowStart,
    windowEnd: asOf,
    rangeStart: colomboDayStartUtc(windowStart),
    rangeEndExclusive: colomboDayStartUtc(addUtcDays(asOf, 1)),
    usedPurchaseDate,
  };
}

/** Nearest integer; .5 rounds up (away from zero for positives). */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value + 0.5);
}

/** Suggested ROP = roundHalfUp(max(0, salesInWindow)). */
export function suggestedRopFromSales(salesInWindow: number | null | undefined): number {
  const s = salesInWindow == null || !Number.isFinite(salesInWindow) ? 0 : salesInWindow;
  return roundHalfUp(Math.max(0, s));
}

/** True if erp1 or erp2 priority equals filter (exact, trimmed). */
export function matchesPriorityFilter(
  erp1: string | null | undefined,
  erp2: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  const f = (filter ?? "").trim();
  if (!f || f.toLowerCase() === "all") return true;
  return (erp1 ?? "").trim() === f || (erp2 ?? "").trim() === f;
}
