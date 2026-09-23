import {
  buildLoyaltyEligibleMerchantSummary,
  type LoyaltyEligibleSummaryDto,
} from "@/lib/customer-insight/loyalty-eligible-summary";
import { CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS } from "@/lib/call-center-weekly-email";
import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";

export { CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS as LOYALTY_ELIGIBLE_WEEKLY_EMAIL_RECIPIENTS };

export type LoyaltyEligibleWeeklyEmailStatus =
  | "sent"
  | "failed"
  | "skipped_no_recipients"
  | "skipped_no_company"
  | "preview";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildLoyaltyEligibleWeeklyEmailHtml(
  summary: LoyaltyEligibleSummaryDto,
  companyName: string
): { subject: string; html: string; text: string } {
  const subject = `Loyalty eligible showdown · Week of ${summary.weekFrom}–${summary.weekTo}`;
  const sentAt = formatAppDateTime(new Date());
  const monthLabel = summary.mtdFrom.slice(0, 7);

  const merchantRows = summary.merchants
    .map(
      (m) =>
        `<tr>
          <td>${escapeHtml(m.merchantLabel)}</td>
          <td style="text-align:right">${m.pending}</td>
          <td style="text-align:right">${m.weekNewlyEligible}</td>
          <td style="text-align:right">${m.weekUpdated}</td>
          <td style="text-align:right">${m.pending}</td>
          <td style="text-align:right">${m.mtdNewlyEligible}</td>
          <td style="text-align:right">${m.mtdUpdated}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#111">
<p>Hi team,</p>
<p>Loyalty eligible showdown for <strong>${escapeHtml(companyName)}</strong>.</p>
<h3>Company totals</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
<tr><th>Period</th><th>Pending (open)</th><th>Newly eligible</th><th>Updated (worked)</th></tr>
<tr><td>This week (${escapeHtml(summary.weekFrom)} → ${escapeHtml(summary.weekTo)})</td>
<td style="text-align:right">${summary.company.pending}</td>
<td style="text-align:right">${summary.company.weekNewlyEligible}</td>
<td style="text-align:right">${summary.company.weekUpdated}</td></tr>
<tr><td>MTD (${escapeHtml(monthLabel)})</td>
<td style="text-align:right">${summary.company.pending}</td>
<td style="text-align:right">${summary.company.mtdNewlyEligible}</td>
<td style="text-align:right">${summary.company.mtdUpdated}</td></tr>
</table>
<h3>Merchant-wise (sorted by MTD pending)</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
<tr>
<th>Merchant</th><th>Week pending*</th><th>Week newly eligible</th><th>Week updated</th>
<th>MTD pending</th><th>MTD newly eligible</th><th>MTD updated</th>
</tr>
${merchantRows || `<tr><td colspan="7">No merchants with activity</td></tr>`}
</table>
<p style="font-size:12px;color:#555">* Week pending column uses current open pending snapshot (same as MTD pending).</p>
<p>Open <strong>Customer Insight</strong> for drill-down. Merchants work <strong>Merchant Dashboard → Loyalty eligible</strong>.</p>
<p style="font-size:12px;color:#555">Cosmo OS · Customer Insight<br/>Sent ${escapeHtml(sentAt)} (Asia/Colombo)</p>
</body></html>`;

  const textLines = [
    `Loyalty eligible showdown for ${companyName}`,
    `Week ${summary.weekFrom}–${summary.weekTo}`,
    `Company pending=${summary.company.pending} weekNew=${summary.company.weekNewlyEligible} weekUpdated=${summary.company.weekUpdated}`,
    `MTD new=${summary.company.mtdNewlyEligible} updated=${summary.company.mtdUpdated}`,
    ...summary.merchants.map(
      (m) =>
        `${m.merchantLabel}: pending=${m.pending} weekNew=${m.weekNewlyEligible} weekUpd=${m.weekUpdated} mtdNew=${m.mtdNewlyEligible} mtdUpd=${m.mtdUpdated}`
    ),
    `Sent ${sentAt}`,
  ];

  return { subject, html, text: textLines.join("\n") };
}

export async function runLoyaltyEligibleWeeklyEmail(input: {
  companyId?: string;
  asOfYmd?: string;
  weekEndYmd?: string;
  preview?: boolean;
  recipients?: string[];
}): Promise<{
  status: LoyaltyEligibleWeeklyEmailStatus;
  weekFrom: string;
  weekTo: string;
  mtdFrom: string;
  recipientCount: number;
  merchantRows: number;
  subject?: string;
  error?: string;
}> {
  const recipients = (
    input.recipients ?? CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS
  )
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

  const company =
    input.companyId != null
      ? await prisma.company.findFirst({
          where: { id: input.companyId },
          select: { id: true, name: true },
        })
      : await prisma.company.findFirst({
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        });

  if (!company) {
    return {
      status: "skipped_no_company",
      weekFrom: "",
      weekTo: "",
      mtdFrom: "",
      recipientCount: 0,
      merchantRows: 0,
    };
  }

  const asOf = input.asOfYmd ?? formatAppIsoDate(new Date());
  const summary = await buildLoyaltyEligibleMerchantSummary({
    companyId: company.id,
    asOfYmd: asOf,
    weekEndYmd: input.weekEndYmd,
  });
  const built = buildLoyaltyEligibleWeeklyEmailHtml(
    summary,
    company.name || "Company"
  );

  if (recipients.length === 0) {
    return {
      status: "skipped_no_recipients",
      weekFrom: summary.weekFrom,
      weekTo: summary.weekTo,
      mtdFrom: summary.mtdFrom,
      recipientCount: 0,
      merchantRows: summary.merchants.length,
      subject: built.subject,
    };
  }

  if (input.preview) {
    return {
      status: "preview",
      weekFrom: summary.weekFrom,
      weekTo: summary.weekTo,
      mtdFrom: summary.mtdFrom,
      recipientCount: recipients.length,
      merchantRows: summary.merchants.length,
      subject: built.subject,
    };
  }

  const send = await sendErpSyncFailureAlertEmail({
    toEmails: recipients,
    subject: built.subject,
    html: built.html,
    plain: built.text,
  });

  if (!send.success) {
    return {
      status: "failed",
      weekFrom: summary.weekFrom,
      weekTo: summary.weekTo,
      mtdFrom: summary.mtdFrom,
      recipientCount: recipients.length,
      merchantRows: summary.merchants.length,
      subject: built.subject,
      error: send.message,
    };
  }

  return {
    status: "sent",
    weekFrom: summary.weekFrom,
    weekTo: summary.weekTo,
    mtdFrom: summary.mtdFrom,
    recipientCount: recipients.length,
    merchantRows: summary.merchants.length,
    subject: built.subject,
  };
}
