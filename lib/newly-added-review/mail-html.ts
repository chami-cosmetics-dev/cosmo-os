import { renderEmailTemplatePlaceholders } from "@/lib/email-templates/render";
import { monthLabel, type NewlyAddedReview } from "@/lib/newly-added-review/calc";
import { NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE } from "@/lib/newly-added-review/mail-templates";
import { NEWLY_ADDED_SHEETS } from "@/lib/newly-added-review/workbook";

const TEXT = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#cbd5e1";
const HEAD_BG = "#17365d";
const FONT = "Arial,Helvetica,sans-serif";

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

function openingText(total: number): { html: string; plain: string } {
  if (total === 0) {
    const text = "No items have been Newly Added for 3 months or more this month, so no priority decision is needed.";
    return { html: text, plain: text };
  }
  const rest = `${total === 1 ? "item has" : "items have"} been Newly Added for 3 months or more and ${total === 1 ? "needs" : "need"} a priority decision. Please review each item and move it to Top, Low or Discontinue, depending on its movement.`;
  return { html: `<strong>${n(total)}</strong> ${rest}`, plain: `${n(total)} ${rest}` };
}

/**
 * The template's placeholder values (Settings → Email Templates). The default body is
 * {{openingHtml}} {{decisionTableHtml}} {{sheetsHtml}} {{notesHtml}}.
 */
export function newlyAddedReviewPlaceholders(
  review: NewlyAddedReview,
  extra: { companyName?: string; generatedAt?: string } = {},
): Record<string, string> {
  const total = review.needsCheck.length;
  const all = review.all.length;
  const cell = `border:1px solid ${BORDER};padding:6px 10px;font-size:13px;color:${TEXT};font-family:${FONT};`;
  const head = `border:1px solid ${HEAD_BG};padding:6px 10px;font-size:13px;color:#ffffff;background-color:${HEAD_BG};text-align:left;font-family:${FONT};`;
  const p = (text: string) =>
    `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:${TEXT};font-family:${FONT};">${text}</p>`;
  const li = (text: string) =>
    `<li style="margin:0 0 4px;font-size:14px;line-height:1.5;color:${TEXT};font-family:${FONT};">${text}</li>`;
  const note = (text: string) =>
    `<p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${MUTED};font-family:${FONT};">${escapeHtml(text)}</p>`;

  const rows = review.byCreatedMonth
    .map(
      (r) =>
        `<tr><td style="${cell}">${escapeHtml(monthLabel(r.month))}</td><td style="${cell}text-align:right;">${n(r.count)}</td></tr>`,
    )
    .join("");

  return {
    companyName: extra.companyName ?? "",
    reportMonth: monthLabel(review.mailMonth),
    generatedAt: extra.generatedAt ?? "",
    needsCheckCount: n(total),
    allNewlyAddedCount: n(all),
    openingHtml: p(openingText(total).html),
    decisionTableHtml:
      total > 0
        ? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 14px;">
<tr><th style="${head}">Created month</th><th style="${head}text-align:right;">Items needing a decision</th></tr>
${rows}
<tr><td style="${cell}font-weight:bold;background-color:#f1f5f9;">Total</td><td style="${cell}text-align:right;font-weight:bold;background-color:#f1f5f9;">${n(total)}</td></tr>
</table>`
        : "",
    sheetsHtml: `<ul style="margin:0 0 14px;padding-left:20px;">
${li(`Sheet 1 &quot;${NEWLY_ADDED_SHEETS.needsCheck}&quot;: the ${n(total)} items above, oldest first.`)}
${li(`Sheet 2 &quot;${NEWLY_ADDED_SHEETS.all}&quot;: all ${n(all)} items currently Newly Added (includes the ${n(total)}).`)}
</ul>`,
    notesHtml: `${note(NEWLY_ADDED_REVIEW_NOTE)}
${note(NEWLY_ADDED_REVIEW_SOURCE)}`,
  };
}

export function newlyAddedReviewSubject(mailMonth: string): string {
  return renderEmailTemplatePlaceholders(NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.subject, {
    reportMonth: monthLabel(mailMonth),
  });
}

/**
 * The mail, from the saved Email Template (blank Subject / Body → the default). "TEST MAIL"
 * banner + "[TEST]" subject only on test sends, never on the scheduled send.
 */
export function buildNewlyAddedReviewMail(
  review: NewlyAddedReview,
  options: {
    test?: boolean;
    template?: { subject?: string | null; bodyHtml?: string | null };
    companyName?: string;
    generatedAt?: string;
  } = {},
): { subject: string; html: string; plain: string } {
  const vars = newlyAddedReviewPlaceholders(review, options);
  const subjectTemplate = options.template?.subject?.trim() || NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.subject;
  const bodyTemplate = options.template?.bodyHtml?.trim() || NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.bodyHtml;
  const subject = `${options.test ? "[TEST] " : ""}${renderEmailTemplatePlaceholders(subjectTemplate, vars)}`;
  const body = renderEmailTemplatePlaceholders(bodyTemplate, vars);
  const banner = options.test
    ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#b91c1c;font-family:${FONT};"><strong>TEST MAIL</strong> — not the scheduled send.</p>`
    : "";
  const html = `<div style="font-family:${FONT};color:${TEXT};">
${banner}
${body}
</div>`;

  const total = review.needsCheck.length;
  const plain = [
    ...(options.test ? ["TEST MAIL — not the scheduled send.", ""] : []),
    openingText(total).plain,
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
    `- Sheet 2 "${NEWLY_ADDED_SHEETS.all}": all ${review.all.length} items currently Newly Added (includes the ${total}).`,
    "",
    NEWLY_ADDED_REVIEW_NOTE,
    NEWLY_ADDED_REVIEW_SOURCE,
  ].join("\n");

  return { subject, html, plain };
}
