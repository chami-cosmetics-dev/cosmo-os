import type { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";

import { GRN_PENDING_DAILY_KEY, LEGACY_GRN_PENDING_BODY_HTML, builtinTemplateByKey } from "@/lib/email-templates/catalog";
import { parseEmailAddressList, renderEmailTemplatePlaceholders } from "@/lib/email-templates/render";
import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { tallyLinkedItems } from "@/lib/grn";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { isIntercompanyPurchaseSupplier } from "@/lib/osf/erp-purchases";
import { prisma } from "@/lib/prisma";

export type GrnPendingEmailSource = "cron" | "manual" | "preview_test";

export type GrnPendingEmailSendStatus =
  | "sent"
  | "failed"
  | "skipped_no_recipients"
  | "skipped_no_pending"
  | "skipped_already_sent";

export type PendingGrnReportRow = {
  prNo: string;
  adjustmentNo: string;
  grnDate: string;
  grnBy: string;
  supplier: string;
  supplierName: string;
  handoverDate: string;
  valuedDate: string;
  purchasingReceivedDate: string;
  pricingReviewedDate: string;
  grnReceivedDate: string;
  status: string;
  tally: string;
};

export type GrnPendingStageSummary = {
  pendingTotal: number;
  pending: number;
  notValued: number;
  notCompleted: number;
  awaitingReceive: number;
  pricingReview: number;
  marginApproval: number;
  paymentApproval: number;
  paymentPending: number;
};

export type GrnPendingReportSnapshot = {
  companyId: string;
  companyName: string;
  reportDate: string;
  generatedAt: string;
  pendingCount: number;
  summary: GrnPendingStageSummary;
  subject: string;
  htmlBody: string;
  reportHtml: string;
  plainBody: string;
  rows: PendingGrnReportRow[];
  attachment: {
    filename: string;
    contentType: string;
    buffer: Buffer;
  };
};

export function getCurrentColomboReportDate(now = new Date()): string {
  return formatAppIsoDate(now);
}


function formatDate(value: Date | null | undefined) {
  if (!value) return "";
  return formatAppIsoDate(value);
}

function workflowStatus(row: {
  handoverAt: Date | null;
  handoverReceivedAt: Date | null;
  valuedAt: Date | null;
  valuationConfirmedAt: Date | null;
  requiresValuationConfirmation: boolean;
  receivedAt: Date | null;
}, isIntercompanySupplier: boolean, approvals?: { marginComplete: boolean; paymentApproved: boolean; paid: boolean }) {
  if (row.receivedAt) {
    if (!isIntercompanySupplier && !approvals?.marginComplete) return "Margin approval pending";
    if (!approvals?.paymentApproved) return "Payment approval pending";
    if (!approvals.paid) return "Payment pending";
    return "Completed";
  }
  if (!row.handoverAt) return "Handover pending";
  if (isVaultOsDeployment()) {
    if (!row.handoverReceivedAt) return "Verify pending";
    if (!row.valuedAt) return "Valuation pending";
    return "GRN received pending";
  }
  if (!row.handoverReceivedAt) return "Receive pending";
  if (!row.valuedAt) return "Valuation pending";
  if (row.requiresValuationConfirmation && !isIntercompanySupplier && !row.valuationConfirmedAt) return "Pricing Review pending";
  return "GRN received pending";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tallyLabel(status: "not_linked" | "matched" | "issue") {
  if (status === "not_linked") return "No linked SSR";
  if (status === "matched") return "Matched";
  return "Issue";
}

function buildWorkbook(rows: PendingGrnReportRow[]) {
  const exportRows = rows.map((row) => ({
    "PR No": row.prNo,
    "Adjustment No": row.adjustmentNo,
    "GRN Date": row.grnDate,
    "GRN By": row.grnBy,
    Supplier: row.supplier,
    "Supplier Name": row.supplierName,
    "Handover Date": row.handoverDate,
    "Purchasing Received": row.purchasingReceivedDate,
    Valued: row.valuedDate,
    "Pricing Reviewed": row.pricingReviewedDate,
    "GRN Received": row.grnReceivedDate,
    Status: row.status,
    Tally: row.tally,
  }));
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(exportRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Pending GRN");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function summarizePendingRows(rows: PendingGrnReportRow[]): GrnPendingStageSummary {
  return {
    pendingTotal: rows.length,
    pending: rows.filter((row) => row.status === "Handover pending").length,
    notValued: rows.filter((row) => row.status === "Valuation pending").length,
    notCompleted: rows.filter((row) => row.status === "GRN received pending").length,
    awaitingReceive: rows.filter((row) => row.status === "Receive pending" || row.status === "Verify pending").length,
    pricingReview: rows.filter((row) => row.status === "Pricing Review pending").length,
    marginApproval: rows.filter((row) => row.status === "Margin approval pending").length,
    paymentApproval: rows.filter((row) => row.status === "Payment approval pending").length,
    paymentPending: rows.filter((row) => row.status === "Payment pending").length,
  };
}

export function buildSummaryTableHtml(summary: GrnPendingStageSummary) {
  const stages = [
    ["Handover pending", summary.pending],
    [isVaultOsDeployment() ? "Verify pending" : "Receive pending", summary.awaitingReceive],
    ["Valuation pending", summary.notValued],
    ...(!isVaultOsDeployment() ? [["Pricing Review pending", summary.pricingReview] as const] : []),
    ["GRN received pending", summary.notCompleted],
    ["Margin approval pending", summary.marginApproval],
    ["Payment approval pending", summary.paymentApproval],
    ["Payment pending", summary.paymentPending],
  ] as const;
  return `<table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <thead>
      <tr style="background:#f9f9f9;">
        <th style="padding:8px;border:1px solid #ddd;text-align:left;">Stage</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;">Count</th>
      </tr>
    </thead>
    <tbody>
      ${stages.map(([label, count]) => `<tr><td style="padding:8px;border:1px solid #ddd;">${label}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${count}</td></tr>`).join("")}
      <tr style="font-weight:700;"><td style="padding:8px;border:1px solid #ddd;">Total</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${summary.pendingTotal}</td></tr>
    </tbody>
  </table>`;
}

async function resolveGrnPendingEmailTemplate(companyId: string) {
  const builtin = builtinTemplateByKey(GRN_PENDING_DAILY_KEY)!;
  const stored = await prisma.emailTemplate.findUnique({
    where: { companyId_key: { companyId, key: GRN_PENDING_DAILY_KEY } },
  });
  return {
    subject: normalizeGrnPendingTemplateSubject(stored?.subject?.trim() || builtin.subject),
    bodyHtml: normalizeGrnPendingTemplateBody(stored?.bodyHtml || builtin.bodyHtml),
    recipients: stored?.recipients ?? builtin.recipients,
    ccRecipients: stored?.ccRecipients ?? builtin.ccRecipients,
  };
}

export function normalizeGrnPendingTemplateBody(bodyHtml: string) {
  return bodyHtml.trim() === LEGACY_GRN_PENDING_BODY_HTML.trim() ? "{{reportHtml}}" : bodyHtml;
}

export function normalizeGrnPendingTemplateSubject(subject: string) {
  return subject.trim() === "Pending GRN status as of {{reportDate}}"
    ? "GRNs needing action — {{reportDate}} ({{total}})"
    : subject;
}

function buildEmailBodies(input: {
  companyName: string;
  reportDate: string;
  generatedAt: string;
  summary: GrnPendingStageSummary;
}) {
  const stageRows = [
    ["Handover", input.summary.pending],
    [isVaultOsDeployment() ? "Verify" : "Receive", input.summary.awaitingReceive],
    ["Valuation", input.summary.notValued],
    ...(!isVaultOsDeployment() ? [["Pricing review", input.summary.pricingReview] as const] : []),
    ["GRN receipt", input.summary.notCompleted],
    ["Margin approval", input.summary.marginApproval],
    ["Payment approval", input.summary.paymentApproval],
    ["Payment", input.summary.paymentPending],
  ].filter(([, count]) => Number(count) > 0);
  const htmlBody = `<div style="background:#f3f6fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#172438;">
  <div style="max-width:720px;margin:auto;background:#fff;border:1px solid #dfe6f1;border-radius:12px;overflow:hidden;">
    <div style="background:#11243f;padding:26px 30px;color:#fff;">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#a8c5ed;">${escapeHtml(input.companyName)} · Daily GRN report</div>
      <h1 style="font-size:25px;line-height:1.3;margin:12px 0 6px;">GRNs needing action</h1>
      <div style="color:#d6e2f4;font-size:14px;">As of ${escapeHtml(input.reportDate)}</div>
    </div>
    <div style="padding:25px 30px;">
      <div style="font-size:15px;line-height:1.5;margin-bottom:22px;"><strong style="font-size:28px;">${input.summary.pendingTotal}</strong> active GRN${input.summary.pendingTotal === 1 ? "" : "s"} awaiting a workflow or payment step.</div>
      <h2 style="font-size:16px;margin:0 0 10px;">Pending by next action</h2>
      <table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px;">${stageRows.map(([label, count]) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #e9edf4;">${escapeHtml(String(label))}</td><td style="padding:10px 12px;border-bottom:1px solid #e9edf4;text-align:right;font-weight:bold;">${count}</td></tr>`).join("")}</table>
      <p style="font-size:13px;color:#596b85;line-height:1.5;margin:22px 0 0;">The attached Excel file has all pending records, stage dates, supplier details, and tally results.</p>
    </div>
    <div style="background:#f8fafd;border-top:1px solid #e4eaf3;padding:14px 30px;font-size:11px;color:#6b7890;">Generated ${escapeHtml(formatAppDateTime(input.generatedAt))}</div>
  </div>
</div>`;

  const plainBody = `Pending GRN Report

${input.companyName} has ${input.summary.pendingTotal} pending GRN(s) as at ${input.reportDate}.
Generated at ${formatAppDateTime(input.generatedAt)}.

Summary:
Handover pending: ${input.summary.pending}
${isVaultOsDeployment() ? "Verify" : "Receive"} pending: ${input.summary.awaitingReceive}
Valuation pending: ${input.summary.notValued}
${isVaultOsDeployment() ? "" : `Pricing Review pending: ${input.summary.pricingReview}\n`}GRN received pending: ${input.summary.notCompleted}
Margin approval pending: ${input.summary.marginApproval}
Payment approval pending: ${input.summary.paymentApproval}
Payment pending: ${input.summary.paymentPending}
Total: ${input.summary.pendingTotal}

Full details are attached as an Excel report.`;

  return { htmlBody, plainBody };
}

export async function buildGrnPendingReportSnapshot(
  companyId: string,
  reportDate: string,
  options?: { isTest?: boolean },
): Promise<GrnPendingReportSnapshot> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("Company not found");

  const intercompanySupplierPrefixes = (await prisma.companyLocation.findMany({
    where: { companyId },
    select: { supplierPrefix: true },
  }))
    .map((location) => location.supplierPrefix?.trim())
    .filter((prefix): prefix is string => Boolean(prefix));

  const amendedSourceRows = await prisma.grnPurchaseReceipt.findMany({
    where: {
      companyId,
      amendedFrom: { not: null },
    },
    select: { amendedFrom: true },
  });
  const amendedSourceNames = amendedSourceRows
    .map((row) => row.amendedFrom)
    .filter((name): name is string => Boolean(name));
  const backfillAmendedSourceRows = await prisma.grnBackfillPurchaseReceipt.findMany({
    where: { companyId, amendedFrom: { not: null } },
    select: { amendedFrom: true },
  });
  const allAmendedSourceNames = [...new Set([
    ...amendedSourceNames,
    ...backfillAmendedSourceRows.map((row) => row.amendedFrom).filter((name): name is string => Boolean(name)),
  ])];

  const receipts = await prisma.grnPurchaseReceipt.findMany({
    where: {
      companyId,
      docstatus: 1,
      deletedAt: null,
      ...(allAmendedSourceNames.length > 0 ? { name: { notIn: allAmendedSourceNames } } : {}),
    },
    include: { items: true },
    orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
  });

  const backfillReceipts = await prisma.grnBackfillPurchaseReceipt.findMany({
    where: { companyId, docstatus: 1, deletedAt: null,
      ...(allAmendedSourceNames.length > 0 ? { name: { notIn: allAmendedSourceNames } } : {}),
    },
    include: { items: true },
    orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
  });
  type EmailReceipt = {
    companyId: string; name: string; creation: Date | null; postingDate: Date | null; createdAt: Date;
    owner: string | null; supplier: string; supplierName: string | null;
    handoverAt: Date | null; handoverReceivedAt: Date | null; valuedAt: Date | null;
    valuationConfirmedAt: Date | null; requiresValuationConfirmation: boolean; receivedAt: Date | null;
    supplierStockReturnName: string | null;
    items: Array<{ itemCode: string; qty: number | Prisma.Decimal; stockQty: number | Prisma.Decimal | null }>;
  };
  const normalizeReceipt = (row: Omit<EmailReceipt, "supplierStockReturnName">, supplierStockReturnName: string | null): EmailReceipt => ({
    companyId: row.companyId, name: row.name, creation: row.creation, postingDate: row.postingDate,
    createdAt: row.createdAt, owner: row.owner, supplier: row.supplier, supplierName: row.supplierName,
    handoverAt: row.handoverAt, handoverReceivedAt: row.handoverReceivedAt, valuedAt: row.valuedAt,
    valuationConfirmedAt: row.valuationConfirmedAt, requiresValuationConfirmation: row.requiresValuationConfirmation,
    receivedAt: row.receivedAt, supplierStockReturnName, items: row.items,
  });
  const liveKeys = new Set(receipts.map((row) => `${row.companyId}:${row.name}`));
  const allReceipts: Array<{ row: EmailReceipt; isBackfill: boolean }> = [
    ...receipts.map((row) => ({ row: normalizeReceipt(row, row.supplierStockReturnName), isBackfill: false })),
    ...backfillReceipts.filter((row) => !liveKeys.has(`${row.companyId}:${row.name}`))
      .map((row) => ({ row: normalizeReceipt(row, null), isBackfill: true })),
  ];
  allReceipts.sort((a, b) =>
    (a.row.creation ?? a.row.postingDate ?? a.row.createdAt).getTime()
    - (b.row.creation ?? b.row.postingDate ?? b.row.createdAt).getTime(),
  );
  const receiptNames = [...new Set(allReceipts.map(({ row }) => row.name))];
  const [marginApprovals, paymentApprovals] = receiptNames.length ? await Promise.all([
    prisma.grnMarginApproval.findMany({ where: { companyId, purchaseReceiptName: { in: receiptNames } }, select: { purchaseReceiptName: true, purchaseReceiptIsBackfill: true, itemCode: true } }),
    prisma.grnPaymentApproval.findMany({ where: { companyId, purchaseReceiptName: { in: receiptNames } }, select: { purchaseReceiptName: true, purchaseReceiptIsBackfill: true, approvedAt: true, paidAt: true } }),
  ]) : [[], []];
  const approvedItems = new Set(marginApprovals.map((approval) => `${approval.purchaseReceiptIsBackfill}:${approval.purchaseReceiptName}:${approval.itemCode}`));
  const payments = new Map(paymentApprovals.map((approval) => [`${approval.purchaseReceiptIsBackfill}:${approval.purchaseReceiptName}`, approval]));

  const linkedSsrNames = receipts
    .map((row) => row.supplierStockReturnName)
    .filter((name): name is string => Boolean(name));
  const linkedReturns =
    linkedSsrNames.length > 0
      ? await prisma.grnSupplierStockReturn.findMany({
          where: {
            companyId,
            name: { in: linkedSsrNames },
          },
          include: { items: true },
        })
      : [];
  const linkedReturnByName = new Map(linkedReturns.map((row) => [row.name, row]));

  const rows = allReceipts.map(({ row, isBackfill }) => {
    const linkedReturn = !isBackfill && row.supplierStockReturnName
      ? linkedReturnByName.get(row.supplierStockReturnName)
      : null;
    const tallyStatus =
      linkedReturn && linkedReturn.docstatus !== 2
        ? tallyLinkedItems(row.items, linkedReturn.items).status
        : "not_linked";

    return {
      prNo: row.name,
      adjustmentNo: row.supplierStockReturnName ?? "",
      grnDate: formatDate(row.creation ?? row.postingDate),
      grnBy: row.owner ?? "",
      supplier: row.supplier,
      supplierName: row.supplierName ?? "",
      handoverDate: formatDate(row.handoverAt),
      valuedDate: formatDate(row.valuedAt),
      purchasingReceivedDate: formatDate(row.handoverReceivedAt),
      pricingReviewedDate: formatDate(row.valuationConfirmedAt),
      grnReceivedDate: formatDate(row.receivedAt),
      status: workflowStatus(row,
        isIntercompanyPurchaseSupplier(row.supplier, row.supplierName, intercompanySupplierPrefixes),
        {
          marginComplete: [...new Set(row.items.map((item) => item.itemCode))].every((code) => approvedItems.has(`${isBackfill}:${row.name}:${code}`)),
          paymentApproved: Boolean(payments.get(`${isBackfill}:${row.name}`)?.approvedAt),
          paid: Boolean(payments.get(`${isBackfill}:${row.name}`)?.paidAt),
        }),
      tally: tallyLabel(tallyStatus),
    };
  }).filter((row) => row.status !== "Completed");

  const generatedAt = new Date().toISOString();
  const summary = summarizePendingRows(rows);
  const template = await resolveGrnPendingEmailTemplate(company.id);
  const bodies = buildEmailBodies({ companyName: company.name, reportDate, generatedAt, summary });
  const templateVars = {
    companyName: company.name,
    reportDate,
    generatedAt: formatAppDateTime(generatedAt),
    notHandedOver: summary.pending,
    notValued: summary.notValued,
    awaitingReceive: summary.awaitingReceive,
    pricingReview: summary.pricingReview,
    grnNotReceived: summary.notCompleted,
    marginApproval: summary.marginApproval,
    paymentApproval: summary.paymentApproval,
    paymentPending: summary.paymentPending,
    total: summary.pendingTotal,
    summaryTableHtml: buildSummaryTableHtml(summary),
    reportHtml: bodies.htmlBody,
  };
  const subject = `${options?.isTest ? "[TEST] " : ""}${renderEmailTemplatePlaceholders(template.subject, templateVars)}`;
  const htmlBody = renderEmailTemplatePlaceholders(template.bodyHtml, templateVars);
  const plainBody = bodies.plainBody;

  return {
    companyId: company.id,
    companyName: company.name,
    reportDate,
    generatedAt,
    pendingCount: rows.length,
    summary,
    subject,
    htmlBody,
    reportHtml: bodies.htmlBody,
    plainBody,
    rows,
    attachment: {
      filename: `pending-grn-${reportDate}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: buildWorkbook(rows),
    },
  };
}

export async function hasSuccessfulGrnPendingEmailSend(companyId: string, reportDate: string) {
  const row = await prisma.grnPendingEmailSendLog.findFirst({
    where: { companyId, reportDate, status: "sent", source: "cron" },
    select: { id: true },
  });
  return Boolean(row);
}

export async function writeGrnPendingEmailSendLog(input: {
  companyId: string;
  reportDate: string;
  status: GrnPendingEmailSendStatus;
  subject?: string | null;
  recipients?: string[];
  errorSummary?: string | null;
  source: GrnPendingEmailSource;
}) {
  await prisma.grnPendingEmailSendLog.create({
    data: {
      companyId: input.companyId,
      reportDate: input.reportDate,
      status: input.status,
      subject: input.subject?.slice(0, 500) ?? null,
      recipientCount: input.recipients?.length ?? 0,
      recipients: (input.recipients ?? []) as Prisma.InputJsonValue,
      errorSummary: input.errorSummary?.slice(0, 1000) ?? null,
      source: input.source,
    },
  });
}

function decideSkip(input: {
  recipients: string[];
  pendingCount: number;
  alreadySent: boolean;
  force?: boolean;
  source: GrnPendingEmailSource;
}): GrnPendingEmailSendStatus | null {
  if (input.recipients.length === 0) return "skipped_no_recipients";
  if (input.source === "cron" && !input.force && input.alreadySent) return "skipped_already_sent";
  if (input.source === "cron" && !input.force && input.pendingCount === 0) return "skipped_no_pending";
  return null;
}

export async function runGrnPendingEmailForCompany(input: {
  companyId: string;
  reportDate: string;
  source: GrnPendingEmailSource;
  force?: boolean;
  isTest?: boolean;
}): Promise<{
  status: GrnPendingEmailSendStatus;
  snapshot?: GrnPendingReportSnapshot;
  errorSummary?: string;
  recipientCount?: number;
}> {
  const template = await resolveGrnPendingEmailTemplate(input.companyId);
  const recipients = parseEmailAddressList(template.recipients);
  const ccEmails = parseEmailAddressList(template.ccRecipients);
  const snapshot = await buildGrnPendingReportSnapshot(input.companyId, input.reportDate, {
    isTest: input.isTest || input.source === "preview_test",
  });
  const alreadySent = await hasSuccessfulGrnPendingEmailSend(input.companyId, input.reportDate);
  const skip = decideSkip({
    recipients,
    pendingCount: snapshot.pendingCount,
    alreadySent,
    force: input.force,
    source: input.source,
  });

  if (skip) {
    await writeGrnPendingEmailSendLog({
      companyId: input.companyId,
      reportDate: input.reportDate,
      status: skip,
      subject: snapshot.subject,
      recipients,
      source: input.source,
    });
    return { status: skip, snapshot, recipientCount: recipients.length };
  }

  const sendResult = await sendErpSyncFailureAlertEmail({
    toEmails: recipients,
    ccEmails,
    subject: snapshot.subject,
    html: snapshot.htmlBody,
    plain: snapshot.plainBody,
    attachments: [
      {
        fileName: snapshot.attachment.filename,
        contentType: snapshot.attachment.contentType,
        contentBase64: snapshot.attachment.buffer.toString("base64"),
      },
    ],
  });

  if (!sendResult.success) {
    await writeGrnPendingEmailSendLog({
      companyId: input.companyId,
      reportDate: input.reportDate,
      status: "failed",
      subject: snapshot.subject,
      recipients,
      errorSummary: sendResult.message ?? "Email send failed",
      source: input.source,
    });
    return {
      status: "failed",
      snapshot,
      errorSummary: sendResult.message ?? "Email send failed",
      recipientCount: recipients.length,
    };
  }

  await writeGrnPendingEmailSendLog({
    companyId: input.companyId,
    reportDate: input.reportDate,
    status: "sent",
    subject: snapshot.subject,
    recipients,
    source: input.source,
  });

  return { status: "sent", snapshot, recipientCount: recipients.length };
}




