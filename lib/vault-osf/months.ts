const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseYearMonth(value: string): { year: number; month: number } {
  if (!MONTH_RE.test(value)) throw new Error(`Invalid month: ${value}`);
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  return { year, month };
}

export function monthKeyFromDate(isoDate: string): string {
  if (!DATE_RE.test(isoDate)) throw new Error(`Invalid date: ${isoDate}`);
  return isoDate.slice(0, 7);
}

/** Most recent 1 April on or before asOfDate. */
export function reportingAprilStart(asOfDate: string): string {
  const monthKey = monthKeyFromDate(asOfDate);
  const { year, month } = parseYearMonth(monthKey);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-04-01`;
}

export function monthKeysInWindow(asOfDate: string): string[] {
  const start = reportingAprilStart(asOfDate).slice(0, 7);
  const end = monthKeyFromDate(asOfDate);
  const { year: sy, month: sm } = parseYearMonth(start);
  const { year: ey, month: em } = parseYearMonth(end);
  const keys: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

/** Inclusive posting_date bounds (YYYY-MM-DD) for one month in the window. */
export function monthPostingBounds(
  monthKey: string,
  asOfDate: string,
): { start: string; end: string } {
  const { year, month } = parseYearMonth(monthKey);
  const start = `${monthKey}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  const current = monthKeyFromDate(asOfDate);
  const end = monthKey === current && asOfDate < monthEnd ? asOfDate : monthEnd;
  return { start, end };
}

export function monthLongName(monthKey: string): string {
  const { year, month } = parseYearMonth(monthKey);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

export function monthYearLabel(monthKey: string): string {
  const { year } = parseYearMonth(monthKey);
  return `${monthLongName(monthKey)} ${year}`;
}

export function monthSectionLabel(monthKey: string, asOfDate: string): string {
  const { year } = parseYearMonth(monthKey);
  const name = monthLongName(monthKey);
  const current = monthKeyFromDate(asOfDate);
  if (monthKey !== current) return `${name.toUpperCase()} ${year}`;
  const [yy, mm, dd] = asOfDate.split("-");
  return `${name.toUpperCase()} ${year} ${dd}.${mm}.${yy}`;
}

/** e.g. "April 2026 Sales Total". */
export function monthTotalSaleHeader(monthKey: string): string {
  return `${monthYearLabel(monthKey)} Sales Total`;
}

/** e.g. "April 2026 Purchase Total" (net purchase value). */
export function monthPurchaseTotalHeader(monthKey: string): string {
  return `${monthYearLabel(monthKey)} Purchase Total`;
}

/** e.g. "April 2026 Purchase Qty". */
export function monthPurchaseQtyHeader(monthKey: string): string {
  return `${monthYearLabel(monthKey)} Purchase Qty`;
}
