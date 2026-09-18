import type { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";

import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { tallyLinkedItems } from "@/lib/grn";
import { sendGrnPendingReportEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { emailSchema } from "@/lib/validation";

const MAX_RECIPIENTS = 20;

export type GrnPendingEmailSource = "cron" | "manual" | "preview_test";

export type GrnPendingEmailSendStatus =
  | "sent"
  | "failed"
  | "skipped_no_recipients"
  | "skipped_disabled"
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
  grnReceivedDate: string;
  status: string;
  tally: string;
};

export type GrnPendingStageSummary = {
  pendingTotal: number;
  pending: number;
  notValued: number;
  notCompleted: number;
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

export function normalizeGrnEmailRecipientList(raw: unknown): string[] {
  const items: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") items.push(item);
    }
  } else if (typeof raw === "string") {
    items.push(...raw.split(/[\n,;]+/));
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim().toLowerCase();
    if (!trimmed) continue;
    const parsed = emailSchema.safeParse(trimmed);
    if (!parsed.success) continue;
    if (seen.has(parsed.data)) continue;
    seen.add(parsed.data);
    out.push(parsed.data);
    if (out.length >= MAX_RECIPIENTS) break;
  }
  return out;
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "";
  return formatAppIsoDate(value);
}

function workflowStatus(row: {
  handoverAt: Date | null;
  valuedAt: Date | null;
  receivedAt: Date | null;
}) {
  if (row.receivedAt) return "GRN Received";
  if (row.valuedAt) return "Valued";
  if (row.handoverAt) return "Handover";
  return "Pending";
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
    Valued: row.valuedDate,
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
    pending: rows.filter((row) => !row.handoverDate).length,
    notValued: rows.filter((row) => !row.valuedDate).length,
    notCompleted: rows.filter((row) => !row.grnReceivedDate).length,
  };
}

function buildEmailBodies(input: {
  companyName: string;
  reportDate: string;
  generatedAt: string;
  rows: PendingGrnReportRow[];
  summary: GrnPendingStageSummary;
}) {
  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#1a1a1a;">Pending GRN Report</h2>
  <p><strong>${escapeHtml(input.companyName)}</strong> has <strong>${input.summary.pendingTotal}</strong> pending GRN${input.summary.pendingTotal === 1 ? "" : "s"} as at ${escapeHtml(input.reportDate)}.</p>
  <p style="color:#666;font-size:13px;">Generated at ${escapeHtml(formatAppDateTime(input.generatedAt))}. Full GRN details are attached as an Excel report.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <thead>
      <tr style="background:#f9f9f9;">
        <th style="padding:8px;border:1px solid #ddd;text-align:left;">Stage</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;">Count</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding:8px;border:1px solid #ddd;">Pending</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${input.summary.pending}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;">Not valued</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${input.summary.notValued}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;">Not completed</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${input.summary.notCompleted}</td></tr>
      <tr style="font-weight:700;"><td style="padding:8px;border:1px solid #ddd;">Total pending</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${input.summary.pendingTotal}</td></tr>
    </tbody>
  </table>
</body>
</html>`.trim();

  const plainBody = `Pending GRN Report

${input.companyName} has ${input.summary.pendingTotal} pending GRN(s) as at ${input.reportDate}.
Generated at ${formatAppDateTime(input.generatedAt)}.

Summary:
Pending: ${input.summary.pending}
Not valued: ${input.summary.notValued}
Not completed: ${input.summary.notCompleted}
Total pending: ${input.summary.pendingTotal}

Full GRN details are attached as an Excel report.`;

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

  const receipts = await prisma.grnPurchaseReceipt.findMany({
    where: {
      companyId,
      docstatus: { not: 2 },
      receivedAt: null,
    },
    include: { items: true },
    orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
    take: 5000,
  });

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

  const rows = receipts.map((row) => {
    const linkedReturn = row.supplierStockReturnName
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
      grnReceivedDate: formatDate(row.receivedAt),
      status: workflowStatus(row),
      tally: tallyLabel(tallyStatus),
    };
  });

  const generatedAt = new Date().toISOString();
  const summary = summarizePendingRows(rows);
  const subject = `${options?.isTest ? "[TEST] " : ""}Pending GRN report - ${company.name} - ${reportDate}`;
  const { htmlBody, plainBody } = buildEmailBodies({
    companyName: company.name,
    reportDate,
    generatedAt,
    rows,
    summary,
  });

  return {
    companyId: company.id,
    companyName: company.name,
    reportDate,
    generatedAt,
    pendingCount: rows.length,
    summary,
    subject,
    htmlBody,
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

export function getGrnPendingEmailConfig(companyId: string) {
  return prisma.grnPendingEmailConfig.findUnique({ where: { companyId } });
}

export function upsertGrnPendingEmailConfig(input: {
  companyId: string;
  enabled: boolean;
  recipients: string[];
}) {
  return prisma.grnPendingEmailConfig.upsert({
    where: { companyId: input.companyId },
    create: {
      companyId: input.companyId,
      enabled: input.enabled,
      recipients: input.recipients as Prisma.InputJsonValue,
    },
    update: {
      enabled: input.enabled,
      recipients: input.recipients as Prisma.InputJsonValue,
    },
  });
}

function decideSkip(input: {
  enabled: boolean;
  recipients: string[];
  pendingCount: number;
  alreadySent: boolean;
  force?: boolean;
  source: GrnPendingEmailSource;
}): GrnPendingEmailSendStatus | null {
  if (input.source === "cron" && !input.force && !input.enabled) return "skipped_disabled";
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
  const config = await getGrnPendingEmailConfig(input.companyId);
  const enabled = config?.enabled ?? true;
  const recipients = normalizeGrnEmailRecipientList(config?.recipients);
  const snapshot = await buildGrnPendingReportSnapshot(input.companyId, input.reportDate, {
    isTest: input.isTest || input.source === "preview_test",
  });
  const alreadySent = await hasSuccessfulGrnPendingEmailSend(input.companyId, input.reportDate);
  const skip = decideSkip({
    enabled,
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

  const sendResult = await sendGrnPendingReportEmail({
    toEmails: recipients,
    subject: snapshot.subject,
    html: snapshot.htmlBody,
    plain: snapshot.plainBody,
    attachment: snapshot.attachment,
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


