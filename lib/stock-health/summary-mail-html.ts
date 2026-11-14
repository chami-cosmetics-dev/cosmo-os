/**
 * Stock Health weekly summary mails: inline-styled HTML (no CSS classes, no images) so it
 * renders the same in every mail app. Light style; the column colours and priority labels
 * follow the Stock Health screen. Pure — the data comes from lib/stock-health/summary-mail.ts.
 */
import { priorityLabelSlot } from "@/components/organisms/item-trends/priority-label";
import type { ShopStockLocationCounts } from "@/lib/shop-stock-status/calc";
import type { DiscontinueMovement, MovementItem } from "@/lib/stock-health/discontinue-movement";
import type {
  StockHealthRopCounts,
  StockHealthStatus,
  StockHealthStatusTotals,
} from "@/lib/stock-health/config";

export type StockHealthSummaryMailData = {
  /** Mail date (Asia/Colombo), already formatted, e.g. "16/11/2026". */
  dateLabel: string;
  /** "November" — the ROP Status month header (as on the screen). */
  month: string;
  /** Live ERP stock time, already formatted. */
  stockAsOf: string;
  /** Sent time, already formatted. */
  sentAt: string;
  /** This week's Weekly Summary (all statuses; Blank is dropped when empty). */
  current: StockHealthStatusTotals[];
  /** The last saved snapshot, or null on the first send. */
  previous: { dateLabel: string; rows: StockHealthStatusTotals[] } | null;
  /** ROP Status rows (screen order, Blank only when it has Common SKUs) + Grand Total. */
  rop: { rows: Array<{ status: StockHealthStatus } & StockHealthRopCounts>; grandTotal: StockHealthRopCounts };
  /** Marks a test send ("[TEST]" subject + banner). */
  test?: boolean;
  /** Mail 2, "Stock Availability Status - Company Wise" (from Shop Stock Status): one row per shop, then per online company. */
  locations?: Array<{
    type: "Shop" | "Online";
    label: string;
    /** Counts per priority at that location (no ROP + no stock there = not counted). */
    byPriority: Partial<Record<StockHealthStatus, ShopStockLocationCounts>>;
  }>;
  /**
   * Mail 1, Discontinue tracking vs last week's item-level snapshot. null = none saved yet
   * (the mail says it starts next week); undefined = section left out.
   */
  discontinue?: { previousDateLabel: string; movement: DiscontinueMovement } | null;
};

const TEXT = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#cbd5e1";
const HEAD_BG = "#f1f5f9";
const TOTAL_ROW_BG = "#f1f5f9";
const FONT = "Arial, Helvetica, sans-serif";

/** Priority labels: pink, cyan, orange, indigo, fuchsia, teal (screen palette slots). */
const PRIORITY_COLOURS = [
  { bg: "#fce7f3", text: "#9d174d", ring: "#f472b6" },
  { bg: "#cffafe", text: "#155e75", ring: "#22d3ee" },
  { bg: "#ffedd5", text: "#9a3412", ring: "#fb923c" },
  { bg: "#e0e7ff", text: "#3730a3", ring: "#818cf8" },
  { bg: "#fae8ff", text: "#86198f", ring: "#e879f9" },
  { bg: "#ccfbf1", text: "#115e59", ring: "#2dd4bf" },
];

/** ROP Status column bands (screen colours, light only). */
type Band = { headBg: string; headText: string; cellBg: string; cellText: string; pctText: string; edge: string };
const BANDS: Record<"pass" | "fail" | "noRopWithStock" | "noRopNoStock" | "total" | "zeroStock", Band> = {
  pass: { headBg: "#a7f3d0", headText: "#064e3b", cellBg: "#ecfdf5", cellText: "#047857", pctText: "#059669", edge: "#10b981" },
  fail: { headBg: "#fecdd3", headText: "#881337", cellBg: "#fff1f2", cellText: "#be123c", pctText: "#e11d48", edge: "#f43f5e" },
  noRopWithStock: { headBg: "#fde68a", headText: "#78350f", cellBg: "#fffbeb", cellText: "#b45309", pctText: "#d97706", edge: "#f59e0b" },
  noRopNoStock: { headBg: "#cbd5e1", headText: "#0f172a", cellBg: "#f8fafc", cellText: "#0f172a", pctText: MUTED, edge: "#64748b" },
  total: { headBg: "#bae6fd", headText: "#0c4a6e", cellBg: "#e0f2fe", cellText: "#0f172a", pctText: MUTED, edge: "#0ea5e9" },
  zeroStock: { headBg: "#fed7aa", headText: "#7c2d12", cellBg: "#fff7ed", cellText: "#c2410c", pctText: "#ea580c", edge: "#f97316" },
};

const GROUP_COLUMNS: Array<{ key: "pass" | "fail" | "noRopWithStock" | "noRopNoStock"; label: string; pctLabel: string }> = [
  { key: "pass", label: "PASS", pctLabel: "PASS %" },
  { key: "fail", label: "FAIL", pctLabel: "FAIL %" },
  { key: "noRopWithStock", label: "No ROP - With Stock", pctLabel: "%" },
  { key: "noRopNoStock", label: "No ROP - No Stock", pctLabel: "%" },
];

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatMailNumber(value: number): string {
  return value.toLocaleString("en-LK", { maximumFractionDigits: 2 });
}

/** count / total × 100 to 1 decimal place; "-" when the row has no Common SKUs. */
export function formatMailPercent(count: number, total: number): string {
  return total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "-";
}

/** "+ 12" / "- 3" / "0" (as the screen's Change column). */
export function formatMailChange(value: number): string {
  if (value > 0) return `+ ${formatMailNumber(value)}`;
  if (value < 0) return `- ${formatMailNumber(Math.abs(value))}`;
  return "0";
}

function style(parts: Record<string, string | undefined>): string {
  return Object.entries(parts)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

function th(text: string, extra: Record<string, string | undefined> = {}, attrs = ""): string {
  return `<th${attrs} style="${style({
    "background-color": HEAD_BG,
    color: TEXT,
    border: `1px solid ${BORDER}`,
    padding: "6px 8px",
    "font-size": "12px",
    "font-weight": "bold",
    "text-align": "center",
    "vertical-align": "middle",
    ...extra,
  })}">${text}</th>`;
}

function td(text: string, extra: Record<string, string | undefined> = {}): string {
  return `<td style="${style({
    color: TEXT,
    border: `1px solid ${BORDER}`,
    padding: "6px 8px",
    "font-size": "13px",
    "text-align": "right",
    "white-space": "nowrap",
    ...extra,
  })}">${text}</td>`;
}

function statusLabel(status: string): string {
  const c = PRIORITY_COLOURS[priorityLabelSlot(status)];
  return `<span style="${style({
    display: "inline-block",
    "background-color": c.bg,
    color: c.text,
    border: `1px solid ${c.ring}`,
    "border-radius": "9999px",
    padding: "2px 8px",
    "font-size": "12px",
    "font-weight": "bold",
    "white-space": "nowrap",
  })}">${escapeHtml(status)}</span>`;
}

function statusCell(status: string): string {
  return td(statusLabel(status), { "text-align": "left" });
}

function totalLabelCell(): string {
  return td("Grand Total", { "text-align": "left", "font-weight": "bold" });
}

const TABLE_OPEN = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FONT};background-color:#ffffff">`;

function heading(text: string): string {
  return `<h2 style="font-family:${FONT};font-size:16px;color:${TEXT};margin:24px 0 8px">${escapeHtml(text)}</h2>`;
}

function note(text: string): string {
  return `<p style="font-family:${FONT};font-size:12px;color:${MUTED};margin:6px 0 0">${text}</p>`;
}

function sum(rows: StockHealthStatusTotals[], pick: (r: StockHealthStatusTotals) => number): number {
  return rows.reduce((t, r) => t + pick(r), 0);
}

/** Weekly Summary rows shown: every status, except Blank when it is empty (as on the screen). */
function shownStatuses(data: StockHealthSummaryMailData): StockHealthStatus[] {
  const countOf = (rows: StockHealthStatusTotals[] | undefined, status: StockHealthStatus) =>
    rows?.find((r) => r.status === status)?.count ?? 0;
  return data.current
    .map((r) => r.status)
    .filter(
      (status) =>
        status !== "Blank" || countOf(data.current, status) > 0 || countOf(data.previous?.rows, status) > 0,
    );
}

function pick(rows: StockHealthStatusTotals[], status: StockHealthStatus) {
  const row = rows.find((r) => r.status === status);
  return { count: row?.count ?? 0, stock: row?.stock ?? 0 };
}

function changeCell(value: number, extra: Record<string, string | undefined> = {}): string {
  const color = value > 0 ? "#059669" : value < 0 ? "#e11d48" : TEXT;
  return td(formatMailChange(value), { color, ...extra });
}

function weeklySummaryHtml(data: StockHealthSummaryMailData): string {
  const statuses = shownStatuses(data);
  const bold = { "font-weight": "bold", "background-color": TOTAL_ROW_BG };

  if (!data.previous) {
    const rows = statuses
      .map((status) => {
        const c = pick(data.current, status);
        return `<tr>${statusCell(status)}${td(formatMailNumber(c.count))}${td(formatMailNumber(c.stock))}</tr>`;
      })
      .join("");
    const shown = data.current.filter((r) => statuses.includes(r.status));
    return `${TABLE_OPEN}
<tr>${th("Priority Status")}${th("Count")}${th("Current Stock")}</tr>
${rows}
<tr style="background-color:${TOTAL_ROW_BG}">${totalLabelCell()}${td(formatMailNumber(sum(shown, (r) => r.count)), bold)}${td(formatMailNumber(sum(shown, (r) => r.stock)), bold)}</tr>
</table>`;
  }

  const previous = data.previous;
  const lines = statuses.map((status) => {
    const prev = pick(previous.rows, status);
    const cur = pick(data.current, status);
    return { status, prev, cur, change: { count: cur.count - prev.count, stock: cur.stock - prev.stock } };
  });
  const total = (f: (l: (typeof lines)[number]) => number) => lines.reduce((t, l) => t + f(l), 0);
  const rows = lines
    .map(
      (l) =>
        `<tr>${statusCell(l.status)}${td(formatMailNumber(l.prev.count))}${td(formatMailNumber(l.prev.stock))}${td(formatMailNumber(l.cur.count))}${td(formatMailNumber(l.cur.stock))}${changeCell(l.change.count)}${changeCell(l.change.stock)}</tr>`,
    )
    .join("");

  return `${TABLE_OPEN}
<tr>${th("Priority Status", {}, ' rowspan="2"')}${th(`Previous week (${escapeHtml(previous.dateLabel)})`, {}, ' colspan="2"')}${th(`This week (${escapeHtml(data.dateLabel)})`, {}, ' colspan="2"')}${th("Change", {}, ' colspan="2"')}</tr>
<tr>${th("Count")}${th("Current Stock")}${th("Count")}${th("Current Stock")}${th("Count")}${th("Current Stock")}</tr>
${rows}
<tr style="background-color:${TOTAL_ROW_BG}">${totalLabelCell()}${td(formatMailNumber(total((l) => l.prev.count)), bold)}${td(formatMailNumber(total((l) => l.prev.stock)), bold)}${td(formatMailNumber(total((l) => l.cur.count)), bold)}${td(formatMailNumber(total((l) => l.cur.stock)), bold)}${changeCell(total((l) => l.change.count), bold)}${changeCell(total((l) => l.change.stock), bold)}</tr>
</table>`;
}

function ropCells(counts: StockHealthRopCounts, isTotalRow: boolean): string {
  const weight = isTotalRow ? "bold" : undefined;
  const groups = GROUP_COLUMNS.map((col) => {
    const b = BANDS[col.key];
    return (
      td(formatMailNumber(counts[col.key]), {
        "background-color": b.cellBg,
        color: b.cellText,
        "font-weight": weight ?? "bold",
        "border-left": `2px solid ${b.edge}`,
      }) +
      td(formatMailPercent(counts[col.key], counts.total), {
        "background-color": b.cellBg,
        color: b.pctText,
        "font-weight": weight,
      })
    );
  }).join("");
  const t = BANDS.total;
  const z = BANDS.zeroStock;
  return (
    groups +
    td(formatMailNumber(counts.total), {
      "background-color": t.cellBg,
      "font-weight": "bold",
      "border-left": `2px solid ${t.edge}`,
      "border-right": `2px solid ${t.edge}`,
    }) +
    td(formatMailNumber(counts.zeroStock), {
      "background-color": z.cellBg,
      color: z.cellText,
      "font-weight": weight ?? "bold",
      "border-left": `2px solid ${z.edge}`,
    }) +
    td(formatMailPercent(counts.zeroStock, counts.total), {
      "background-color": z.cellBg,
      color: z.pctText,
      "font-weight": weight,
    })
  );
}

function bandHead(text: string, band: Band, edge: boolean, both = false): string {
  return th(text, {
    "background-color": band.headBg,
    color: band.headText,
    "border-left": edge ? `2px solid ${band.edge}` : undefined,
    "border-right": both ? `2px solid ${band.edge}` : undefined,
  });
}

function ropStatusHtml(data: StockHealthSummaryMailData): string {
  const heads =
    GROUP_COLUMNS.map((col) => bandHead(col.label, BANDS[col.key], true) + bandHead(col.pctLabel, BANDS[col.key], false)).join("") +
    bandHead("Grand Total", BANDS.total, true, true) +
    bandHead("0' Stock", BANDS.zeroStock, true) +
    bandHead("0' Stock %", BANDS.zeroStock, false);
  const rows = data.rop.rows.map((row) => `<tr>${statusCell(row.status)}${ropCells(row, false)}</tr>`).join("");

  return `${TABLE_OPEN}
<tr>${th("Priority Status", {}, ' rowspan="2"')}${th(`${escapeHtml(data.month)} - ${escapeHtml(data.dateLabel)}`, { "font-size": "13px" }, ' colspan="11"')}</tr>
<tr>${heads}</tr>
${rows}
<tr style="background-color:${TOTAL_ROW_BG}">${totalLabelCell()}${ropCells(data.rop.grandTotal, true)}</tr>
</table>`;
}

/** The weekly summary goes out as two mails (mail 2 Monday, mail 1 Tuesday): 1 = Weekly Summary, 2 = Stock Availability Status - Overall (the screen's ROP Status table). */
export const STOCK_HEALTH_MAIL_PARTS = ["weekly", "rop"] as const;
export type StockHealthMailPart = (typeof STOCK_HEALTH_MAIL_PARTS)[number];

export const STOCK_HEALTH_MAIL_PART_TITLES: Record<StockHealthMailPart, string> = {
  weekly: "Weekly Summary",
  rop: "Stock Availability Status - Overall",
};

export function stockHealthSummaryMailSubject(
  data: Pick<StockHealthSummaryMailData, "dateLabel" | "test">,
  part: StockHealthMailPart,
): string {
  return `${data.test ? "[TEST] " : ""}Stock Health Summary - ${STOCK_HEALTH_MAIL_PART_TITLES[part]} - ${data.dateLabel}`;
}

/** Company Wise priorities: Top, Low, Newly Added, Discontinue (+ Blank only when it has items). */
function locationPriorities(locations: NonNullable<StockHealthSummaryMailData["locations"]>): StockHealthStatus[] {
  const base: StockHealthStatus[] = ["Top", "Low", "Newly Added", "Discontinue"];
  return locations.some((l) => (l.byPriority.Blank?.total ?? 0) > 0) ? [...base, "Blank"] : base;
}

const EMPTY_LOCATION_COUNTS: ShopStockLocationCounts = {
  pass: 0,
  fail: 0,
  noRopWithStock: 0,
  noRopNoStock: 0,
  total: 0,
  zeroStock: 0,
};

type LocationGroup = {
  label: string;
  band: keyof typeof BANDS;
  value: (c: ShopStockLocationCounts) => string;
  pct?: boolean;
  /** Only these priorities get a sub-column (default: all shown). */
  only?: StockHealthStatus[];
};

/** Company Wise: each group split by priority (count, then its % of that priority's Grand Total). */
const LOCATION_GROUPS: LocationGroup[] = [
  { label: "Pass", band: "pass", value: (c) => formatMailNumber(c.pass) },
  { label: "Pass %", band: "pass", value: (c) => formatMailPercent(c.pass, c.total), pct: true },
  { label: "Fail", band: "fail", value: (c) => formatMailNumber(c.fail) },
  { label: "Fail %", band: "fail", value: (c) => formatMailPercent(c.fail, c.total), pct: true },
  { label: "No ROP - With Stock", band: "noRopWithStock", value: (c) => formatMailNumber(c.noRopWithStock) },
  { label: "No ROP - With Stock %", band: "noRopWithStock", value: (c) => formatMailPercent(c.noRopWithStock, c.total), pct: true },
  // Top only (counted in Top's Grand Total); other priorities leave these items out.
  { label: "No ROP - No Stock", band: "noRopNoStock", value: (c) => formatMailNumber(c.noRopNoStock), only: ["Top"] },
  { label: "Grand Total", band: "total", value: (c) => formatMailNumber(c.total) },
];

/** Company Wise - Out of Stock: the same Grand Total, then 0' Stock and its %. */
const OUT_OF_STOCK_GROUPS: LocationGroup[] = [
  { label: "Grand Total", band: "total", value: (c) => formatMailNumber(c.total) },
  { label: "0' Stock", band: "zeroStock", value: (c) => formatMailNumber(c.zeroStock) },
  { label: "0' Stock %", band: "zeroStock", value: (c) => formatMailPercent(c.zeroStock, c.total), pct: true },
];

const COMPACT = { padding: "4px 5px", "font-size": "12px" };

/** Short sub-column labels so the Company Wise tables fit the mail width (key under the table). */
const PRIORITY_SHORT: Record<StockHealthStatus, string> = {
  Top: "Top",
  Low: "Low",
  "Newly Added": "New",
  Discontinue: "Disc.",
  Blank: "Blank",
};
const PRIORITY_KEY = "Top = Top · Low = Low · New = Newly Added · Disc. = Discontinue.";

/** A location's Grand Totals added up over the priorities shown (the Company Total column). */
function locationCompanyTotal(
  loc: NonNullable<StockHealthSummaryMailData["locations"]>[number],
  priorities: StockHealthStatus[],
): number {
  return priorities.reduce((sum, p) => sum + (loc.byPriority[p]?.total ?? 0), 0);
}

/** Type (merged per group) | Location | each group split into Top / Low / Newly Added / Discontinue. */
function locationTableHtml(
  locations: NonNullable<StockHealthSummaryMailData["locations"]>,
  groups: LocationGroup[],
  options: { companyTotal?: boolean } = {},
): string {
  const all = locationPriorities(locations);
  const subs = (g: LocationGroup) => (g.only ? all.filter((p) => g.only!.includes(p)) : all);
  const t = BANDS.total;

  const groupHeads =
    groups
      .map((g) => {
        const b = BANDS[g.band];
        const single = subs(g).length === 1;
        return th(
          g.label,
          {
            "background-color": b.headBg,
            color: b.headText,
            "border-left": `2px solid ${b.edge}`,
            ...COMPACT,
            // A one-column group (No ROP - No Stock, Top only) wraps its heading instead of widening.
            width: single ? "52px" : undefined,
          },
          ` colspan="${subs(g).length}"`,
        );
      })
      .join("") +
    (options.companyTotal
      ? th(
          "Company Total",
          {
            "background-color": t.headBg,
            color: t.headText,
            "border-left": `2px solid ${t.edge}`,
            "border-right": `2px solid ${t.edge}`,
            ...COMPACT,
            width: "56px",
          },
          ' rowspan="2"',
        )
      : "");
  const priorityHeads = groups
    .map((g) => {
      const b = BANDS[g.band];
      return subs(g)
        .map((p, i) =>
          th(escapeHtml(PRIORITY_SHORT[p]), {
            "background-color": b.headBg,
            color: b.headText,
            "border-left": i === 0 ? `2px solid ${b.edge}` : undefined,
            ...COMPACT,
            "font-size": "11px",
          }),
        )
        .join("");
    })
    .join("");

  const rows = locations
    .map((loc, i) => {
      const first = i === 0 || locations[i - 1].type !== loc.type;
      const span = locations.filter((l) => l.type === loc.type).length;
      const typeCell = first
        ? `<td rowspan="${span}" style="${style({
            color: TEXT,
            border: `1px solid ${BORDER}`,
            padding: "6px 8px",
            "font-size": "13px",
            "font-weight": "bold",
            "text-align": "left",
            "vertical-align": "middle",
            "background-color": TOTAL_ROW_BG,
          })}">${loc.type}</td>`
        : "";
      const cells = groups
        .map((g) => {
          const b = BANDS[g.band];
          return subs(g)
            .map((p, j) =>
              td(g.value(loc.byPriority[p] ?? EMPTY_LOCATION_COUNTS), {
                "background-color": b.cellBg,
                color: g.pct ? b.pctText : b.cellText,
                "font-weight": g.pct ? undefined : "bold",
                "border-left": j === 0 ? `2px solid ${b.edge}` : undefined,
                ...COMPACT,
              }),
            )
            .join("");
        })
        .join("");
      // Company Total = that location's Grand Totals added up over every priority shown.
      const companyTotal = options.companyTotal
        ? td(formatMailNumber(locationCompanyTotal(loc, all)), {
            "background-color": t.headBg,
            color: t.headText,
            "font-weight": "bold",
            "border-left": `2px solid ${t.edge}`,
            "border-right": `2px solid ${t.edge}`,
            ...COMPACT,
          })
        : "";
      return `<tr>${typeCell}${td(escapeHtml(loc.label), { "text-align": "left", ...COMPACT, "font-size": "13px" })}${cells}${companyTotal}</tr>`;
    })
    .join("");

  return `${TABLE_OPEN}
<tr>${th("Type", {}, ' rowspan="2"')}${th("Location", {}, ' rowspan="2"')}${groupHeads}</tr>
<tr>${priorityHeads}</tr>
${rows}
</table>`;
}

/**
 * Mail 1's Discontinue tracking: one line per kind of move that happened (Remark | Status |
 * No. of items | SKUs), lines with no items left out; System Error last. Status = whether the
 * move took items out of Discontinue (reduction) or into it (addition).
 */
function discontinueLines(d: NonNullable<StockHealthSummaryMailData["discontinue"]>) {
  const m = d.movement;
  const lines: Array<{ remark: string; status: "reduction" | "addition"; items: MovementItem[]; error?: boolean }> = [
    { remark: "Discontinue to Top", status: "reduction", items: m.movedOut.Top },
    { remark: "Discontinue to Low", status: "reduction", items: m.movedOut.Low },
    { remark: "Discontinue to Newly Added", status: "reduction", items: m.movedOut["Newly Added"] },
    { remark: "Discontinue to Blank", status: "reduction", items: m.movedOut.Blank },
    { remark: "Discontinue, no longer counted", status: "reduction", items: m.noLongerCounted },
    { remark: "Top to Discontinue", status: "addition", items: m.movedIn.Top },
    { remark: "Low to Discontinue", status: "addition", items: m.movedIn.Low },
    { remark: "Newly Added to Discontinue", status: "addition", items: m.movedIn["Newly Added"] },
    { remark: "System Error", status: "addition", items: m.systemErrors, error: true },
  ];
  return lines.filter((l) => l.items.length > 0);
}

function discontinueSummary(d: NonNullable<StockHealthSummaryMailData["discontinue"]>, thisWeekLabel: string): string {
  return `Discontinue: ${formatMailNumber(d.movement.previousCount)} on ${d.previousDateLabel} → ${formatMailNumber(d.movement.currentCount)} on ${thisWeekLabel}.`;
}

function discontinueHtml(data: StockHealthSummaryMailData): string {
  if (data.discontinue === undefined) return "";
  if (data.discontinue === null) {
    return `
${heading("Discontinue Tracking")}
${note("Starts with next week's mail: it compares each item's priority against the week before, so it needs one saved week first.")}`;
  }
  const lines = discontinueLines(data.discontinue);
  const summary = note(escapeHtml(discontinueSummary(data.discontinue, data.dateLabel)));
  if (lines.length === 0) {
    return `
${heading("Discontinue Tracking")}
${note("No items moved in or out of Discontinue since last week.")}
${summary}`;
  }
  const rows = lines
    .map((l) => {
      const st = l.error ? { "background-color": BANDS.fail.cellBg, color: BANDS.fail.cellText, "font-weight": "bold" } : {};
      return `<tr>${td(escapeHtml(l.remark), { "text-align": "left", ...st })}${td(l.status, { "text-align": "left", ...st })}${td(formatMailNumber(l.items.length), st)}${td(
        escapeHtml(l.items.map((i) => i.commonSku).join(", ")),
        { "text-align": "left", "white-space": "normal", "max-width": "520px", ...st },
      )}</tr>`;
    })
    .join("");
  return `
${heading("Discontinue Tracking")}
${TABLE_OPEN}
<tr>${th("Remark", { "text-align": "left" })}${th("Status", { "text-align": "left" })}${th("No. of items")}${th("SKUs", { "text-align": "left" })}</tr>
${rows}
</table>
${summary}
${note("System Error = Discontinue now, but had no priority last week (a new item, or Blank).")}`;
}

function partBody(data: StockHealthSummaryMailData, part: StockHealthMailPart): string {
  if (part === "weekly") {
    const weeklyNote = data.previous
      ? `Previous week = snapshot saved with the mail on ${escapeHtml(data.previous.dateLabel)}. Change = This week − Previous week.`
      : "The first summary mail — next week's mail will compare against these figures.";
    return `${heading("Weekly Summary")}
${weeklySummaryHtml(data)}
${note(weeklyNote)}${discontinueHtml(data)}`;
  }
  return `${heading(STOCK_HEALTH_MAIL_PART_TITLES.rop)}
${ropStatusHtml(data)}
${note("PASS = stock above 50% of ROP. 0' Stock = out of stock in all companies.")}
${note("0' Stock overlaps the groups and is not in the Grand Total.")}${
    data.locations?.length
      ? `
${heading("Stock Availability Status - Company Wise")}
${locationTableHtml(data.locations, LOCATION_GROUPS, { companyTotal: true })}
${note(PRIORITY_KEY)}
${note("Per location: Pass = stock at or above 50% of that location's ROP, Fail = below 50%. Items with no ROP and no stock at a location are not counted, except for Top (No ROP - No Stock, included in Top's Grand Total).")}
${heading("Stock Availability Status - Company Wise - Out of Stock")}
${locationTableHtml(data.locations, OUT_OF_STOCK_GROUPS)}
${note(PRIORITY_KEY)}
${note("0' Stock = has a ROP at that location but no stock there (part of Fail); not added to the Grand Total. % = 0' Stock ÷ Grand Total.")}`
      : ""
  }`;
}

/** Where each mail's figures come from (the "Data sources" table at the end of each mail). */
const SHARED_SOURCES: Array<[string, string]> = [
  [
    "Current stock",
    'ERP (ERP 1 + ERP 2) - "Stock Balance Summary - Item Wise" report, all warehouses, generated fresh when the mail is sent',
  ],
  ["Items, Common SKU & priority", 'ERP - Item list, "Product Priority" (ERP 1; ERP 2 when ERP 1 is blank)'],
  ["Website status", "Cosmo OS - products synced from the website (Shopify); website drafts with no stock left out"],
  ["Excluded SKUs", "Cosmo OS - Purchasing → Stock Health → Excluded SKUs"],
];

export const STOCK_HEALTH_MAIL_SOURCES: Record<StockHealthMailPart, Array<[string, string]>> = {
  weekly: [
    ...SHARED_SOURCES,
    ["Previous week", "Cosmo OS - Weekly Summary snapshot saved when last week's mail was sent"],
    ["Discontinue Tracking", "Cosmo OS - each item's priority saved with last week's mail, compared with today's"],
  ],
  rop: [
    ...SHARED_SOURCES,
    [
      "ROP",
      'Cosmo OS - Order Supporting File (OSF) ROP, all active OSF columns with "Include in ROP"',
    ],
    [
      "Company Wise (per location)",
      "Cosmo OS - Store → Shop Stock Status: stock from each location's ERP warehouses, ROP from its OSF columns",
    ],
  ],
};

function sourcesHtml(part: StockHealthMailPart): string {
  const rows = STOCK_HEALTH_MAIL_SOURCES[part]
    .map(
      ([what, from]) =>
        `<tr>${td(escapeHtml(what), { "text-align": "left", "font-weight": "bold", "font-size": "12px", padding: "4px 8px" })}${td(escapeHtml(from), { "text-align": "left", "white-space": "normal", "font-size": "12px", color: MUTED, padding: "4px 8px" })}</tr>`,
    )
    .join("");
  return `
${heading("Data sources")}
${TABLE_OPEN}
<tr>${th("Data", { "text-align": "left" })}${th("Taken from", { "text-align": "left" })}</tr>
${rows}
</table>`;
}

/** One of the two weekly mails (same data, same styling). */
export function buildStockHealthSummaryMail(
  data: StockHealthSummaryMailData,
  part: StockHealthMailPart,
): { subject: string; html: string; plain: string } {
  const subject = stockHealthSummaryMailSubject(data, part);
  const testNote =
    part === "weekly" ? "Test mail — no snapshot saved." : "Test mail.";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:16px;background-color:#ffffff;color:${TEXT};font-family:${FONT}">
${data.test ? `<p style="font-family:${FONT};font-size:13px;color:#9a3412;background-color:#fff7ed;border:1px solid #fdba74;padding:8px 12px;margin:0 0 12px">${testNote}</p>` : ""}
<p style="font-family:${FONT};font-size:14px;color:${TEXT};margin:0 0 4px">Dear team,</p>
<p style="font-family:${FONT};font-size:14px;color:${TEXT};margin:0">Here is the ${part === "rop" ? "Stock Availability Status" : `Stock Health ${STOCK_HEALTH_MAIL_PART_TITLES.weekly}`} for ${escapeHtml(data.dateLabel)}.</p>
${note(`Live ERP stock as of ${escapeHtml(data.stockAsOf)} (excluded SKUs and website drafts with no stock left out).`)}
${partBody(data, part)}
${sourcesHtml(part)}
<p style="font-family:${FONT};font-size:12px;color:${MUTED};margin:24px 0 0">Cosmo OS · Purchasing → Stock Health<br>Sent ${escapeHtml(data.sentAt)} (Asia/Colombo)</p>
</body></html>`;

  return { subject, html, plain: buildPlain(data, subject, part) };
}

function buildPlain(data: StockHealthSummaryMailData, subject: string, part: StockHealthMailPart): string {
  const lines = [subject];
  if (data.test) lines.push(part === "weekly" ? "TEST MAIL — no snapshot saved." : "TEST MAIL.");
  lines.push(`Live ERP stock as of ${data.stockAsOf}`, "");
  if (part === "weekly") {
    lines.push("WEEKLY SUMMARY");
    for (const status of shownStatuses(data)) {
      const cur = pick(data.current, status);
      if (data.previous) {
        const prev = pick(data.previous.rows, status);
        lines.push(
          `${status}: previous ${formatMailNumber(prev.count)} / ${formatMailNumber(prev.stock)}, this week ${formatMailNumber(cur.count)} / ${formatMailNumber(cur.stock)}, change ${formatMailChange(cur.count - prev.count)} / ${formatMailChange(cur.stock - prev.stock)}`,
        );
      } else {
        lines.push(`${status}: count ${formatMailNumber(cur.count)}, stock ${formatMailNumber(cur.stock)}`);
      }
    }
    if (data.discontinue === null) {
      lines.push("", "DISCONTINUE TRACKING: starts with next week's mail.");
    } else if (data.discontinue) {
      lines.push("", "DISCONTINUE TRACKING");
      const moves = discontinueLines(data.discontinue);
      if (moves.length === 0) lines.push("No items moved in or out of Discontinue since last week.");
      for (const l of moves) {
        lines.push(`${l.remark} (${l.status}): ${l.items.length} — ${l.items.map((i) => i.commonSku).join(", ")}`);
      }
      lines.push(discontinueSummary(data.discontinue, data.dateLabel));
    }
  } else {
    lines.push(`${STOCK_HEALTH_MAIL_PART_TITLES.rop.toUpperCase()} (${data.month})`);
    const ropLine = (label: string, c: StockHealthRopCounts) =>
      `${label}: PASS ${c.pass} (${formatMailPercent(c.pass, c.total)}), FAIL ${c.fail} (${formatMailPercent(c.fail, c.total)}), No ROP - With Stock ${c.noRopWithStock} (${formatMailPercent(c.noRopWithStock, c.total)}), No ROP - No Stock ${c.noRopNoStock} (${formatMailPercent(c.noRopNoStock, c.total)}), Grand Total ${c.total}, 0' Stock ${c.zeroStock} (${formatMailPercent(c.zeroStock, c.total)})`;
    for (const row of data.rop.rows) lines.push(ropLine(row.status, row));
    lines.push(ropLine("Grand Total", data.rop.grandTotal));
    lines.push("", "0' Stock = out of stock in all companies. It overlaps the groups and is not in the Grand Total.");
    if (data.locations?.length) {
      lines.push("", "STOCK AVAILABILITY STATUS - COMPANY WISE");
      const priorities = locationPriorities(data.locations);
      for (const loc of data.locations) {
        for (const p of priorities) {
          const c = loc.byPriority[p] ?? EMPTY_LOCATION_COUNTS;
          lines.push(
            `${loc.type} · ${loc.label} · ${p}: Pass ${c.pass} (${formatMailPercent(c.pass, c.total)}), Fail ${c.fail} (${formatMailPercent(c.fail, c.total)}), No ROP - With Stock ${c.noRopWithStock} (${formatMailPercent(c.noRopWithStock, c.total)})${p === "Top" ? `, No ROP - No Stock ${c.noRopNoStock}` : ""}, Grand Total ${c.total}`,
          );
        }
        lines.push(`${loc.type} · ${loc.label} · Company Total: ${formatMailNumber(locationCompanyTotal(loc, priorities))}`);
      }
      lines.push("", "STOCK AVAILABILITY STATUS - COMPANY WISE - OUT OF STOCK");
      for (const loc of data.locations) {
        for (const p of priorities) {
          const c = loc.byPriority[p] ?? EMPTY_LOCATION_COUNTS;
          lines.push(
            `${loc.type} · ${loc.label} · ${p}: Grand Total ${c.total}, 0' Stock ${c.zeroStock} (${formatMailPercent(c.zeroStock, c.total)})`,
          );
        }
      }
    }
  }
  lines.push("", "DATA SOURCES");
  for (const [what, from] of STOCK_HEALTH_MAIL_SOURCES[part]) lines.push(`${what}: ${from}`);
  lines.push("", `Sent ${data.sentAt} (Asia/Colombo)`);
  return lines.join("\n");
}
