import { monthLabel, type NewlyAddedReview } from "@/lib/newly-added-review/calc";
import { NEWLY_ADDED_SHEETS } from "@/lib/newly-added-review/workbook";

const TEXT = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#cbd5e1";
const HEAD_BG = "#17365d";

/** The grey note at the end: what the figures cover, then where the data comes from. */
export const NEWLY_ADDED_REVIEW_NOTE =
  "Covers all channels (Online and Shop). Created date = date the item first came into stock. Current stock = live stock across all warehouses.";
export const NEWLY_ADDED_REVIEW_SOURCE =
  "Data source: ERP (both ERPs) — Product Priority, stock ledger (created date) and live stock balances; the same data as Cosmo OS Item Trends.";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function n(value: number): string {
  return value.toLocaleString("en-US");
}

export function newlyAddedReviewSubject(mailMonth: string): string {
  return `Newly Added Priority Review - ${monthLabel(mailMonth)}`;
}

/**
 * The mail: the decision needed (N in bold), Created month | Items needing a decision (+ Total),
 * what each sheet holds, then the grey note. "TEST MAIL" only on test sends.
 */
export function buildNewlyAddedReviewMail(
  review: NewlyAddedReview,
  options: { test?: boolean } = {},
): { subject: string; html: string; plain: string } {
  const subject = `${options.test ? "[TEST] " : ""}${newlyAddedReviewSubject(review.mailMonth)}`;
  const total = review.needsCheck.length;
  const all = review.all.length;
  const cell = `border:1px solid ${BORDER};padding:6px 10px;font-size:13px;color:${TEXT};`;
  const head = `border:1px solid ${HEAD_BG};padding:6px 10px;font-size:13px;color:#ffffff;background-color:${HEAD_BG};text-align:left;`;
  const p = (text: string, extra = "") =>
    `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:${TEXT};${extra}">${text}</p>`;

  const opening =
    total > 0
      ? `<strong>${n(total)}</strong> ${total === 1 ? "item has" : "items have"} been Newly Added for 3 months or more and ${total === 1 ? "needs" : "need"} a priority decision. Please review each item and move it to Top, Low or Discontinue, depending on its movement.`
      : "No items have been Newly Added for 3 months or more this month, so no priority decision is needed.";

  const rows = review.byCreatedMonth
    .map(
      (r) =>
        `<tr><td style="${cell}">${escapeHtml(monthLabel(r.month))}</td><td style="${cell}text-align:right;">${n(r.count)}</td></tr>`,
    )
    .join("");
  const table =
    total > 0
      ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 14px;">
<tr><th style="${head}">Created month</th><th style="${head}text-align:right;">Items needing a decision</th></tr>
${rows}
<tr><td style="${cell}font-weight:bold;background-color:#f1f5f9;">Total</td><td style="${cell}text-align:right;font-weight:bold;background-color:#f1f5f9;">${n(total)}</td></tr>
</table>`
      : "";

  const li = (text: string) => `<li style="margin:0 0 4px;font-size:14px;line-height:1.5;color:${TEXT};">${text}</li>`;
  const sheets = `<ul style="margin:0 0 14px;padding-left:20px;">
${li(`Sheet 1 &quot;${NEWLY_ADDED_SHEETS.needsCheck}&quot;: the ${n(total)} items above, oldest first.`)}
${li(`Sheet 2 &quot;${NEWLY_ADDED_SHEETS.all}&quot;: all ${n(all)} items currently Newly Added (includes the ${n(total)}).`)}
</ul>`;

  const note = (text: string) => `<p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(text)}</p>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:${TEXT};">
${options.test ? p(`<strong>TEST MAIL</strong> — not the scheduled send.`, "color:#b91c1c;") : ""}
${p(opening)}
${table}
${sheets}
${note(NEWLY_ADDED_REVIEW_NOTE)}
${note(NEWLY_ADDED_REVIEW_SOURCE)}
</div>`;

  const plain = [
    ...(options.test ? ["TEST MAIL — not the scheduled send.", ""] : []),
    opening.replace(/<\/?strong>/g, ""),
    "",
    ...(total > 0
      ? [
          "Created month | Items needing a decision",
          ...review.byCreatedMonth.map((r) => `${monthLabel(r.month)} | ${r.count}`),
          `Total | ${total}`,
          "",
        ]
      : []),
    `- Sheet 1 "${NEWLY_ADDED_SHEETS.needsCheck}": the ${total} items above, oldest first.`,
    `- Sheet 2 "${NEWLY_ADDED_SHEETS.all}": all ${all} items currently Newly Added (includes the ${total}).`,
    "",
    NEWLY_ADDED_REVIEW_NOTE,
    NEWLY_ADDED_REVIEW_SOURCE,
  ].join("\n");

  return { subject, html, plain };
}
