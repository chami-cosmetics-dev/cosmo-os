import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  parseEmailAddressList,
  renderEmailTemplatePlaceholders,
} from "@/lib/email-templates/render";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { getCurrentColomboReportDate } from "@/lib/grn-pending-email";
import { buildReceivableEmailPreview } from "@/lib/receivable-outstanding-email";
import { loadCachedReceivables, refreshReceivables } from "@/lib/receivable-outstanding";
import { SUPPLIER_PAYABLE_OUTSTANDING_DAILY_KEY } from "@/lib/email-templates/catalog";
import { buildSupplierPayablesEmailPreview, buildSupplierPayablesEmailWorkbook } from "@/lib/supplier-payables-email";
import { loadCachedSupplierPayables, refreshSupplierPayables } from "@/lib/supplier-payables";
import { MARGIN_ISSUES_DAILY_KEY } from "@/lib/email-templates/catalog";
import { buildMarginIssuesEmailPreview, buildMarginIssuesWorkbook } from "@/lib/margin-issues-email";
import { loadMarginIssuesReport } from "@/lib/margin-issues";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

export const dynamic = "force-dynamic";

const testSendSchema = z.object({
  key: trimmedString(1, 64),
  name: trimmedString(1, 120),
  subject: trimmedString(0, LIMITS.emailTemplateSubject.max),
  bodyHtml: trimmedString(0, LIMITS.emailTemplateBody.max),
  recipients: z.string().max(LIMITS.emailTemplateRecipients.max).transform((s) => s.trim()),
  ccRecipients: z
    .string()
    .max(LIMITS.emailTemplateRecipients.max)
    .transform((s) => s.trim())
    .optional()
    .default(""),
});

const SAMPLE_PLACEHOLDERS: Record<string, string | number> = {
  companyName: "Cosmo OS",
  reportDate: new Date().toISOString().slice(0, 10),
  generatedAt: new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" }),
  total: 12,
  notHandedOver: 4,
  notValued: 5,
  grnNotReceived: 3,
  summaryTableHtml:
    "<table border=\"1\" cellpadding=\"6\" cellspacing=\"0\"><tbody><tr><td>Not handed over</td><td>4</td></tr><tr><td>Not valued</td><td>5</td></tr><tr><td>GRN not received</td><td>3</td></tr><tr><td>Total</td><td>12</td></tr></tbody></table>",
  staffName: "Sample Staff",
  resignationDate: new Date().toISOString().slice(0, 10),
  reason: "Test email",
  employeeNumber: "EMP-000",
  department: "Sample Department",
  designation: "Sample Designation",
  location: "Sample Location",
  itemCount: 10,
  erp1Label: "ERP 1",
  erp2Label: "ERP 2",
  erp1Count: 4,
  erp2Count: 6,
  erp1MissingStandardCount: 1,
  erp1MissingOgfCount: 1,
  erp1MissingBothCount: 2,
  erp2MissingStandardCount: 2,
  erp2MissingOgfCount: 1,
  erp2MissingBothCount: 3,
  erp1TableHtml: "<p>Sample ERP 1 table.</p>",
  erp2TableHtml: "<p>Sample ERP 2 table.</p>",
  standardMismatchCount: 1,
  standardMismatchTableHtml: "<p>Sample standard price mismatch table.</p>",
};

function htmlToPlain(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.email_templates");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (!user?.companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = testSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const toEmails = parseEmailAddressList(parsed.data.recipients);
  const ccEmails = parseEmailAddressList(parsed.data.ccRecipients);
  if (toEmails.length === 0) {
    return NextResponse.json({ error: "Add at least one To recipient before sending a test." }, { status: 400 });
  }

  let placeholders = SAMPLE_PLACEHOLDERS;
  let attachments: Array<{ fileName: string; contentType: string; contentBase64: string }> | undefined;
  if (parsed.data.key.startsWith("receivable_")) {
    const reportDate = getCurrentColomboReportDate();
    await refreshReceivables(user.companyId, reportDate);
    const actual = buildReceivableEmailPreview((await loadCachedReceivables(user.companyId, reportDate)).rows, parsed.data.key);
    placeholders = { ...SAMPLE_PLACEHOLDERS, reportDate, summaryTableHtml: actual.summaryTableHtml, rowCount: actual.rowCount, totalValue: actual.totalValue };
    attachments = [{ fileName: `${parsed.data.key}-${reportDate}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: actual.attachment.toString("base64") }];
  } else if (parsed.data.key === SUPPLIER_PAYABLE_OUTSTANDING_DAILY_KEY) {
    const reportDate = getCurrentColomboReportDate();
    await refreshSupplierPayables(user.companyId, reportDate);
    const actual = await loadCachedSupplierPayables(user.companyId, reportDate);
    const lineCount = actual.groups.reduce((sum, group) => sum + group.lines.length, 0);
    placeholders = { ...SAMPLE_PLACEHOLDERS, reportDate, summaryTableHtml: buildSupplierPayablesEmailPreview(actual.groups), supplierCount: actual.groups.length, lineCount };
    attachments = [{ fileName: `supplier-payable-outstanding-${reportDate}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: buildSupplierPayablesEmailWorkbook(actual.groups).toString("base64") }];
  } else if (parsed.data.key === MARGIN_ISSUES_DAILY_KEY) {
    const reportDate = getCurrentColomboReportDate();
    const report = await loadMarginIssuesReport(user.companyId, reportDate);
    const actual = buildMarginIssuesEmailPreview(report);
    placeholders = { ...SAMPLE_PLACEHOLDERS, reportDate, summaryTableHtml: actual.summaryTableHtml, skuCount: actual.skuCount, stockAvailable: actual.stockAvailable };
    attachments = [{ fileName: `margin-issues-${reportDate}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: buildMarginIssuesWorkbook(report).toString("base64") }];
  }
  const subject = `[TEST] ${renderEmailTemplatePlaceholders(parsed.data.subject, placeholders)}`;
  const html = `<p style="color:#666;font-size:12px;">Test email for template <strong>${parsed.data.name}</strong> (${parsed.data.key}).</p>${renderEmailTemplatePlaceholders(parsed.data.bodyHtml, placeholders)}`;
  const plain = htmlToPlain(html) || subject;

  const result = await sendErpSyncFailureAlertEmail({
    toEmails,
    ccEmails,
    subject,
    html,
    plain,
    attachments,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.message ?? "Failed to send test email" }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
