/**
 * Which month a Sales Budget save is for. Client-safe (the screen and the server both use it).
 * A budget is saved during the month BEFORE it: in October 2026 (Asia/Colombo) the screen
 * saves the November 2026 budget.
 */

const COLOMBO = "Asia/Colombo";

/** Current Colombo month, YYYY-MM. */
export function colomboMonth(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBO,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

/** "2026-10" + 1 → "2026-11"; "2026-12" + 1 → "2027-01". */
export function addMonths(month: string, count: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The month saves made now are for (next Colombo month). */
export function budgetTargetMonth(date: Date = new Date()): string {
  return addMonths(colomboMonth(date), 1);
}

/** "2026-11" → "November 2026" (long) / "Nov 2026" (short). */
export function formatBudgetMonth(month: string, style: "long" | "short" = "long"): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "Last saved" time in Colombo: 27.10.2026 10:55. */
export function formatSavedAt(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: COLOMBO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

/** Saved date only, Colombo: 27.10.2026. */
export function formatSavedDate(iso: string): string {
  return formatSavedAt(iso).slice(0, 10);
}

/**
 * Downloaded file name: Sales_Budget_<Mon>_<budget year>_<DD.MM.YYYY>.xlsx, e.g. the November
 * 2026 budget last saved 27 Oct 2026 → Sales_Budget_Nov_2026_27.10.2026.xlsx.
 */
export function budgetFileName(
  targetMonth: string,
  dateIso: string,
  kind: { prefix: "Sales_Budget" | "Sales_History"; ext: "xlsx" | "csv" | "zip" } = {
    prefix: "Sales_Budget",
    ext: "xlsx",
  },
): string {
  const [mon, year] = formatBudgetMonth(targetMonth, "short").split(" ");
  return `${kind.prefix}_${mon}_${year}_${formatSavedDate(dateIso)}.${kind.ext}`;
}

/** Download bundle names: the zip, and the budget Excel + sales history CSV inside it. */
export function budgetBundleNames(targetMonth: string, dateIso: string) {
  return {
    zip: budgetFileName(targetMonth, dateIso, { prefix: "Sales_Budget", ext: "zip" }),
    xlsx: budgetFileName(targetMonth, dateIso),
    csv: budgetFileName(targetMonth, dateIso, { prefix: "Sales_History", ext: "csv" }),
  };
}

/**
 * Null when `targetMonth` can be saved now; else the reason. Only during the month before it.
 */
export function budgetSaveBlockedReason(targetMonth: string, now: Date = new Date()): string | null {
  if (budgetTargetMonth(now) === targetMonth) return null;
  return `Budgets for ${formatBudgetMonth(targetMonth)} can only be saved during ${formatBudgetMonth(addMonths(targetMonth, -1))}.`;
}
