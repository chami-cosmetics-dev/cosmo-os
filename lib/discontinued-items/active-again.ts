/**
 * Phase 6: weekly "active again" check of done (drafted + verified) Discontinued Items, and its
 * mail. Pure, client-safe.
 */

export const ACTIVE_AGAIN_SETTING_KEY = "active_again_mail";

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Weekly run, Asia/Colombo. weekday: 0 = Sunday … 6 = Saturday; time "HH:MM" (24h). */
export type ActiveAgainSchedule = { weekday: number; time: string };

/** Temporary default until confirmed: Monday 9:30 AM. */
export const DEFAULT_ACTIVE_AGAIN_SCHEDULE: ActiveAgainSchedule = { weekday: 1, time: "09:30" };

export function parseActiveAgainSchedule(value: unknown): ActiveAgainSchedule {
  const v = (value ?? {}) as Partial<ActiveAgainSchedule>;
  const weekday = Number.isInteger(v.weekday) && v.weekday! >= 0 && v.weekday! <= 6 ? v.weekday! : null;
  const time = typeof v.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) ? v.time : null;
  return {
    weekday: weekday ?? DEFAULT_ACTIVE_AGAIN_SCHEDULE.weekday,
    time: time ?? DEFAULT_ACTIVE_AGAIN_SCHEDULE.time,
  };
}

export function describeSchedule(schedule: ActiveAgainSchedule): string {
  const [h, m] = schedule.time.split(":").map(Number);
  const hour12 = ((h + 11) % 12) + 1;
  return `${WEEKDAY_LABELS[schedule.weekday]} ${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * This week's run slot (Asia/Colombo; weeks run Monday–Sunday) and the week's key (its Monday,
 * YYYY-MM-DD). The run is due once `now` is at or past the slot and that week has not run yet.
 */
export function weeklySlot(now: Date, schedule: ActiveAgainSchedule): { weekKey: string; slot: Date } {
  const local = new Date(now.getTime() + COLOMBO_OFFSET_MS); // Colombo wall clock in UTC fields
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday);
  const weekKey = new Date(monday).toISOString().slice(0, 10);
  const [h, m] = schedule.time.split(":").map(Number);
  const offsetDays = (schedule.weekday + 6) % 7; // Monday = 0 … Sunday = 6
  const slotLocal = monday + offsetDays * 86_400_000 + (h * 60 + m) * 60_000;
  return { weekKey, slot: new Date(slotLocal - COLOMBO_OFFSET_MS) };
}

export function isWeeklyRunDue(now: Date, schedule: ActiveAgainSchedule, lastRunWeek: string | null): boolean {
  const { weekKey, slot } = weeklySlot(now, schedule);
  return lastRunWeek !== weekKey && now.getTime() >= slot.getTime();
}

/** One row of the mail table (all from the saved row, except the current priority). */
export type ActiveAgainMailRow = {
  sku: string;
  itemName: string | null;
  maxSale: number | null;
  impressions: number | null;
  clicks: number | null;
  /** Fraction. */
  ctr: number | null;
  avgPosition: number | null;
  reason: string | null;
  /** YYYY-MM-DD */
  draftedDate: string | null;
  /** Current ERP Product Priority; null when the SKU is not on the item list any more. */
  currentPriority: string | null;
};

const TEXT = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#cbd5e1";
const HEAD_BG = "#17365d";
const FONT = "Arial,Helvetica,sans-serif";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const num = (v: number | null) => (v == null ? "-" : v.toLocaleString("en-US"));
const pct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(2)}%`);
const dec = (v: number | null) => (v == null ? "-" : v.toFixed(2));

/** The template's placeholders: {{itemCount}}, {{introHtml}}, {{tableHtml}}, {{noteHtml}}, … */
export function activeAgainPlaceholders(
  rows: ActiveAgainMailRow[],
  extra: { companyName?: string; generatedAt?: string; reportDate?: string } = {},
): Record<string, string> {
  const cell = `border:1px solid ${BORDER};padding:6px 8px;font-size:13px;color:${TEXT};font-family:${FONT};vertical-align:top;`;
  const right = `${cell}text-align:right;white-space:nowrap;`;
  const head = `border:1px solid ${HEAD_BG};padding:6px 8px;font-size:12px;color:#ffffff;background-color:${HEAD_BG};text-align:left;font-family:${FONT};`;
  const headers = [
    "SKU",
    "Item name",
    "Max sale",
    "Impressions",
    "Clicks",
    "CTR",
    "Average position",
    "Reason for draft",
    "Drafted date",
    "Priority after being made active",
  ];
  const body = rows
    .map(
      (r) =>
        `<tr>` +
        `<td style="${cell}font-family:Consolas,monospace;white-space:nowrap;">${escapeHtml(r.sku)}</td>` +
        `<td style="${cell}">${escapeHtml(r.itemName ?? "-")}</td>` +
        `<td style="${right}">${num(r.maxSale)}</td>` +
        `<td style="${right}">${num(r.impressions)}</td>` +
        `<td style="${right}">${num(r.clicks)}</td>` +
        `<td style="${right}">${pct(r.ctr)}</td>` +
        `<td style="${right}">${dec(r.avgPosition)}</td>` +
        `<td style="${cell}">${escapeHtml(r.reason ?? "-")}</td>` +
        `<td style="${cell}white-space:nowrap;">${escapeHtml(r.draftedDate ?? "-")}</td>` +
        `<td style="${cell}font-weight:bold;">${escapeHtml(r.currentPriority ?? "Not on the item list")}</td>` +
        `</tr>`,
    )
    .join("");
  const count = rows.length;
  return {
    companyName: extra.companyName ?? "",
    reportDate: extra.reportDate ?? "",
    generatedAt: extra.generatedAt ?? "",
    itemCount: String(count),
    introHtml: `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:${TEXT};font-family:${FONT};"><strong>${count}</strong> ${count === 1 ? "item that was" : "items that were"} drafted in Item Drafting (Discontinued Items) ${count === 1 ? "is" : "are"} active on Shopify again.</p>`,
    tableHtml:
      `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 14px;">` +
      `<tr>${headers.map((h) => `<th style="${head}">${h}</th>`).join("")}</tr>${body}</table>`,
    noteHtml: `<p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${MUTED};font-family:${FONT};">Max sale, Search Console figures, reason and drafted date are as saved when the item was drafted. Priority is the current ERP Product Priority. Each item is reported once.</p>`,
  };
}
