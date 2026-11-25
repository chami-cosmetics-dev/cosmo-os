import "server-only";

import { Prisma } from "@prisma/client";

import { parseEmailAddressList } from "@/lib/email-templates/render";
import { formatAppDate, formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { sendStockHealthSummaryEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { summarizeShopStockLocationByPriority } from "@/lib/shop-stock-status/calc";
import { ONLINE_STOCK_COLUMNS, SHOP_STOCK_COLUMNS } from "@/lib/shop-stock-status/config";
import type { ShopStockStatus } from "@/lib/shop-stock-status/config";
import { loadShopStockStatus } from "@/lib/shop-stock-status/load";
import { buildShopStockStatusWorkbook } from "@/lib/shop-stock-status/workbook";
import { notCountedReasonOf, summarizeByStatus, summarizeRopStatus } from "@/lib/stock-health/calc";
import { buildDiscontinueMovement, type SkuStatus } from "@/lib/stock-health/discontinue-movement";
import {
  buildRopStatusWorkbook,
  buildWeeklySummaryWorkbook,
  XLSX_CONTENT_TYPE,
  type StockHealthWorkbook,
} from "@/lib/stock-health/export-workbooks";
import {
  currentMonthName,
  loadStockHealthRopData,
  type StockHealthRopData,
} from "@/lib/stock-health/rop-status";
import {
  buildStockHealthSummaryMail,
  STOCK_HEALTH_MAIL_TEMPLATES,
  stockHealthMailPlaceholders,
  STOCK_HEALTH_MAIL_PARTS,
  type StockHealthMailPart,
  type StockHealthSummaryMailData,
} from "@/lib/stock-health/summary-mail-html";
import {
  loadPreviousStockHealthSnapshot,
  loadStockHealthSkuSnapshot,
  stockHealthSkuSnapshotWrites,
  stockHealthSnapshotWrites,
} from "@/lib/stock-health/weekly-summary";

export type MailRecipients = { to: string[]; cc: string[] };

export type StockHealthMailTemplate = {
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  recipients: MailRecipients;
};

/**
 * One mail's Email Template (Settings → Email Templates): To / CC as saved there (none until
 * someone adds them), Subject / Body as saved or the default.
 */
export async function loadStockHealthMailTemplate(
  companyId: string,
  part: StockHealthMailPart,
): Promise<StockHealthMailTemplate> {
  const defaults = STOCK_HEALTH_MAIL_TEMPLATES[part];
  const stored = await prisma.emailTemplate.findUnique({
    where: { companyId_key: { companyId, key: defaults.key } },
    select: { name: true, subject: true, bodyHtml: true, recipients: true, ccRecipients: true },
  });
  const to = parseEmailAddressList(stored?.recipients);
  const cc = parseEmailAddressList(stored?.ccRecipients).filter((email) => !to.includes(email));
  return {
    key: defaults.key,
    name: stored?.name || (part === "weekly" ? "Stock Health Weekly Summary" : "Stock Availability Status"),
    subject: stored?.subject?.trim() || defaults.subject,
    bodyHtml: stored?.bodyHtml?.trim() || defaults.bodyHtml,
    recipients: { to, cc },
  };
}

/** A YYYY-MM-DD Colombo day → display date (same format as the screen). */
function dateLabelOf(isoDate: string): string {
  return formatAppDate(`${isoDate}T12:00:00+05:30`);
}

type MailAttachment = { fileName: string; contentType: string; contentBase64: string };
type BuiltMail = { subject: string; html: string; plain: string; attachments: MailAttachment[] };

function xlsxAttachment({ fileName, buffer }: StockHealthWorkbook): MailAttachment {
  return { fileName, contentType: XLSX_CONTENT_TYPE, contentBase64: buffer.toString("base64") };
}

type MailWorkbookInputs = { data: StockHealthRopData; shopStock: ShopStockStatus };

/**
 * Each mail's Excel attachments — the same files as the screens' Export buttons, built from the
 * mail's own data load:
 * - Weekly Summary → Stock Health Weekly Summary "Download breakdown"
 * - Stock Availability Status → ROP Status "Download breakdown" + Shop Stock Status
 *   "Export (SHOP + ONLINE)"
 */
const MAIL_WORKBOOKS: Record<
  StockHealthMailPart,
  (inputs: MailWorkbookInputs) => Promise<StockHealthWorkbook[]>
> = {
  weekly: async ({ data }) => [buildWeeklySummaryWorkbook(data)],
  rop: async ({ data, shopStock }) => [
    buildRopStatusWorkbook(data),
    await buildShopStockStatusWorkbook(shopStock),
  ],
};

/**
 * Both mails' figures, from the same functions as the screen: Weekly Summary =
 * `summarizeByStatus`, ROP Status = `summarizeRopStatus`, over one load of the live ERP data,
 * so both mails use the same stock. `refresh` regenerates the ERP stock report.
 */
async function loadMailInputs(
  companyId: string,
  mailDate: string,
  options: { refresh: boolean; test: boolean },
): Promise<{
  current: ReturnType<typeof summarizeByStatus>;
  skuStatuses: SkuStatus[];
  mailData: StockHealthSummaryMailData;
  data: StockHealthRopData;
  shopStock: ShopStockStatus;
}> {
  const [data, previous, company] = await Promise.all([
    loadStockHealthRopData(companyId, { refresh: options.refresh }),
    loadPreviousStockHealthSnapshot(companyId, mailDate),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  const current = summarizeByStatus(data.items, data.stockBySku, data.excluded);
  // Each counted Common SKU's priority now (the same rows as the Weekly Summary counts).
  const skuStatuses: SkuStatus[] = data.ropRows.map((row) => ({
    commonSku: row.commonSku,
    status: row.status,
    itemName: [...row.variants].sort((a, b) => a.sku.localeCompare(b.sku)).find((v) => v.itemName)?.itemName ?? null,
  }));
  const previousSkus = previous ? await loadStockHealthSkuSnapshot(companyId, previous.snapshotDate) : [];
  // After the load above (not alongside it), so it reads the same — just refreshed — ERP data.
  const shopStock = await loadShopStockStatus(companyId);
  const locations: StockHealthSummaryMailData["locations"] = [
    ...SHOP_STOCK_COLUMNS.filter((c) => c.key !== "online").map((c) => ({
      type: "Shop" as const,
      label: c.label,
      byPriority: summarizeShopStockLocationByPriority(shopStock.tabs.shops, c.key),
    })),
    ...ONLINE_STOCK_COLUMNS.map((c) => ({
      type: "Online" as const,
      label: c.label,
      byPriority: summarizeShopStockLocationByPriority(shopStock.tabs.online, c.key),
    })),
  ];
  const mailData: StockHealthSummaryMailData = {
    dateLabel: dateLabelOf(mailDate),
    month: currentMonthName(),
    stockAsOf: formatAppDateTime(data.fetchedAt),
    sentAt: formatAppDateTime(new Date()),
    current,
    previous: previous && { dateLabel: dateLabelOf(previous.snapshotDate), rows: previous.rows },
    rop: summarizeRopStatus(data.ropRows),
    test: options.test,
    companyName: company?.name ?? "",
    locations,
    // null = no item-level snapshot from last week yet → the mail says tracking starts next week.
    discontinue:
      previous && previousSkus.length > 0
        ? {
            previousDateLabel: dateLabelOf(previous.snapshotDate),
            movement: buildDiscontinueMovement(previousSkus, skuStatuses, (sku) =>
              notCountedReasonOf(sku, data.items, data.stockBySku, data.excluded),
            ),
          }
        : null,
  };
  return { current, skuStatuses, mailData, data, shopStock };
}

/** Both mails built from one data load, each with its Email Template's Subject / Body. */
async function loadMailData(
  companyId: string,
  mailDate: string,
  options: { refresh: boolean; test: boolean; attachFor: readonly StockHealthMailPart[] },
  templates: Record<StockHealthMailPart, StockHealthMailTemplate>,
): Promise<{
  current: ReturnType<typeof summarizeByStatus>;
  skuStatuses: SkuStatus[];
  mails: Record<StockHealthMailPart, BuiltMail>;
}> {
  const { current, skuStatuses, mailData, data, shopStock } = await loadMailInputs(companyId, mailDate, options);
  const build = async (part: StockHealthMailPart): Promise<BuiltMail> => ({
    ...buildStockHealthSummaryMail(mailData, part, templates[part]),
    // Only the mails actually being sent get their Excel files built.
    attachments: options.attachFor.includes(part)
      ? (await MAIL_WORKBOOKS[part]({ data, shopStock })).map(xlsxAttachment)
      : [],
  });
  const [weekly, rop] = await Promise.all([build("weekly"), build("rop")]);
  return { current, skuStatuses, mails: { weekly, rop } };
}

async function loadBothTemplates(companyId: string): Promise<Record<StockHealthMailPart, StockHealthMailTemplate>> {
  const [weekly, rop] = await Promise.all([
    loadStockHealthMailTemplate(companyId, "weekly"),
    loadStockHealthMailTemplate(companyId, "rop"),
  ]);
  return { weekly, rop };
}

/**
 * Settings → Email Templates "Send test mail" for the two Stock Health keys: the real
 * placeholder values (today's tables, screen cache), to fill the template being edited, plus
 * the same Excel attachments the scheduled mail carries.
 */
export async function loadStockHealthMailTestPlaceholders(
  companyId: string,
  key: string,
): Promise<{ placeholders: Record<string, string>; attachments: MailAttachment[] } | null> {
  const part = STOCK_HEALTH_MAIL_PARTS.find((x) => STOCK_HEALTH_MAIL_TEMPLATES[x].key === key);
  if (!part) return null;
  const { mailData, data, shopStock } = await loadMailInputs(companyId, formatAppIsoDate(new Date()), {
    refresh: false,
    test: true,
  });
  return {
    placeholders: stockHealthMailPlaceholders(mailData, part),
    attachments: (await MAIL_WORKBOOKS[part]({ data, shopStock })).map(xlsxAttachment),
  };
}

export type StockHealthSummaryMailResult = {
  companyId: string;
  /** weekly = mail 1 (Weekly Summary), rop = mail 2 (Stock Availability Status). */
  part: StockHealthMailPart;
  status:
    | "sent"
    | "failed"
    | "skipped_wrong_day"
    | "skipped_no_recipients"
    | "skipped_already_sent"
    | "preview";
  mailDate: string;
  recipientCount: number;
  subject?: string;
  /** Only for preview. */
  html?: string;
  error?: string;
};

/**
 * The day each mail goes out (Asia/Colombo, 9:00 AM — see vercel.json): mail 2 on Monday,
 * mail 1 on Tuesday. 1 = Monday … 7 = Sunday.
 */
export const STOCK_HEALTH_MAIL_DAYS: Record<StockHealthMailPart, { weekday: number; label: string }> = {
  weekly: { weekday: 2, label: "Tuesday" },
  rop: { weekday: 1, label: "Monday" },
};

/** 1 = Monday … 7 = Sunday, for a YYYY-MM-DD date. */
function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay() || 7;
}

const logKey = (companyId: string, mailDate: string, part: StockHealthMailPart) => ({
  companyId_mailDate_part: { companyId, mailDate, part },
});

/**
 * Claims today's send of one mail. A row per company + day + mail is created before sending;
 * a second run finds it and stops. Only a failed send is claimed again. A run that dies
 * between the claim and the send leaves "sending" — never retried, so no double send.
 */
async function claimSend(
  companyId: string,
  mailDate: string,
  part: StockHealthMailPart,
  recipients: MailRecipients,
): Promise<boolean> {
  const list = `To: ${recipients.to.join(", ")}${recipients.cc.length ? ` | CC: ${recipients.cc.join(", ")}` : ""}`;
  const data = { status: "sending", recipients: list, error: null };
  try {
    await prisma.stockHealthSummaryMail.create({ data: { companyId, mailDate, part, ...data } });
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }
  const { count } = await prisma.stockHealthSummaryMail.updateMany({
    where: { companyId, mailDate, part, status: "failed" },
    data,
  });
  return count === 1;
}

/** True when this mail was already sent (or is being sent) today — only a failed one is retried. */
async function alreadySent(companyId: string, mailDate: string, part: StockHealthMailPart): Promise<boolean> {
  const row = await prisma.stockHealthSummaryMail.findUnique({
    where: logKey(companyId, mailDate, part),
    select: { status: true },
  });
  return row !== null && row.status !== "failed";
}

/**
 * One scheduled mail for one company, once per day: mail 2 (Stock Availability Status) on Monday,
 * mail 1 (Weekly Summary) on Tuesday, each with fresh ERP stock, to
 * that mail's Email Template To / CC (Settings → Email Templates). When mail 1 goes out, this week's Weekly Summary (totals + each
 * item's priority) is saved as the snapshot next week's mail 1 compares against.
 */
export async function sendScheduledStockHealthMail(
  companyId: string,
  part: StockHealthMailPart,
  mailDate = formatAppIsoDate(new Date()),
): Promise<StockHealthSummaryMailResult> {
  const result = (
    status: StockHealthSummaryMailResult["status"],
    extra: Partial<StockHealthSummaryMailResult> = {},
  ): StockHealthSummaryMailResult => ({ companyId, part, mailDate, status, recipientCount: 0, ...extra });

  if (weekdayOf(mailDate) !== STOCK_HEALTH_MAIL_DAYS[part].weekday) return result("skipped_wrong_day");

  const templates = await loadBothTemplates(companyId);
  const recipients = templates[part].recipients;
  if (recipients.to.length === 0) {
    console.warn(
      `[stock-health-mail] Email Template "${templates[part].name}" (${templates[part].key}) has no To recipients — mail not sent (company ${companyId}, ${mailDate}). Add them in Settings → Email Templates.`,
    );
    return result("skipped_no_recipients");
  }
  const recipientCount = recipients.to.length + recipients.cc.length;
  if (await alreadySent(companyId, mailDate, part)) {
    console.log(`[stock-health-mail] ${part} mail already sent for ${mailDate} (company ${companyId}) — skipped.`);
    return result("skipped_already_sent", { recipientCount });
  }

  // The slow ERP load happens before the claim, so the claim → send window is short.
  const { current, skuStatuses, mails } = await loadMailData(
    companyId,
    mailDate,
    { refresh: true, test: false, attachFor: [part] },
    templates,
  );
  const mail = mails[part];
  if (!(await claimSend(companyId, mailDate, part, recipients))) {
    return result("skipped_already_sent", { recipientCount });
  }

  const { send, attachmentsDropped } = await sendWithAttachmentFallback(recipients, mail, part);
  if (!send.success) {
    await prisma.stockHealthSummaryMail.update({
      where: logKey(companyId, mailDate, part),
      data: { status: "failed", error: send.message ?? "Send failed" },
    });
    console.error(`[stock-health-mail] ${part} mail failed for ${mailDate} (company ${companyId}):`, send.message);
    return result("failed", { recipientCount, subject: mail.subject, error: send.message });
  }

  const markSent = prisma.stockHealthSummaryMail.update({
    where: logKey(companyId, mailDate, part),
    data: { status: "sent" },
  });
  try {
    // Mail 1 carries the Weekly Summary, so its send saves the snapshot (totals + each item).
    await prisma.$transaction(
      part === "weekly"
        ? [
            ...stockHealthSnapshotWrites(companyId, mailDate, current),
            ...stockHealthSkuSnapshotWrites(companyId, mailDate, skuStatuses),
            markSent,
          ]
        : [markSent],
    );
  } catch (error) {
    // The mail went out; the row stays "sending", so it is not sent again.
    console.error(`[stock-health-mail] ${part} mail sent, but saving failed (${mailDate}, company ${companyId}):`, error);
    return result("sent", {
      recipientCount,
      subject: mail.subject,
      error: `Saved state not updated: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  console.log(`[stock-health-mail] ${part} mail sent for ${mailDate} to ${recipientCount} recipient(s) (company ${companyId}).`);
  return result("sent", {
    recipientCount,
    subject: mail.subject,
    ...(attachmentsDropped && { error: `Sent without Excel attachments: ${attachmentsDropped}` }),
  });
}

/** Where each mail's Excel files can be downloaded instead, for the fallback note. */
const ATTACHMENT_SOURCES: Record<StockHealthMailPart, string> = {
  weekly: "Stock Health → Weekly Summary → Download breakdown",
  rop: "Stock Health → ROP Status → Download breakdown, and Shop Stock Status → Export (SHOP + ONLINE)",
};

/**
 * Scheduled sends only: when the mail with its Excel files is rejected (e.g. too large), send it
 * once more without them and with a note saying where to download them, so the summary still
 * goes out. `attachmentsDropped` is the first send's error when that happened.
 */
async function sendWithAttachmentFallback(
  recipients: MailRecipients,
  mail: BuiltMail,
  part: StockHealthMailPart,
): Promise<{ send: { success: boolean; message?: string }; attachmentsDropped: string | null }> {
  const base = { toEmails: recipients.to, ccEmails: recipients.cc };
  const first = await sendStockHealthSummaryEmail({ ...base, ...mail });
  if (first.success || mail.attachments.length === 0) return { send: first, attachmentsDropped: null };

  const reason = first.message ?? "Send failed";
  console.warn(`[stock-health-mail] ${part} mail rejected with attachments (${reason}) — retrying without them.`);
  const note = `The Excel attachments could not be included in this mail. Please download them from ${ATTACHMENT_SOURCES[part]}.`;
  const retry = await sendStockHealthSummaryEmail({
    ...base,
    subject: mail.subject,
    html: `<p style="color:#9a3412;font-size:13px;margin:0 0 12px;">${note}</p>${mail.html}`,
    plain: `${note}\n\n${mail.plain}`,
    attachments: [],
  });
  return {
    send: retry.success ? retry : { success: false, message: `${reason}; retry without attachments: ${retry.message ?? "failed"}` },
    attachmentsDropped: retry.success ? reason : null,
  };
}

/** Cron: one mail for every company with an ERP. */
export async function sendScheduledStockHealthMailForAllCompanies(
  part: StockHealthMailPart,
): Promise<StockHealthSummaryMailResult[]> {
  const mailDate = formatAppIsoDate(new Date());
  const companies = await prisma.company.findMany({
    where: { erpnextInstances: { some: {} } },
    select: { id: true },
  });
  const results: StockHealthSummaryMailResult[] = [];
  for (const company of companies) {
    try {
      results.push(await sendScheduledStockHealthMail(company.id, part, mailDate));
    } catch (error) {
      console.error(`[stock-health-mail] ${part} mail failed for company ${company.id}:`, error);
      results.push({
        companyId: company.id,
        part,
        mailDate,
        status: "failed",
        recipientCount: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

/**
 * Test mails on demand: today's figures (the screen's cached ERP data), compared against the
 * last saved snapshot. Save no snapshot and do not count as the scheduled send. `preview` returns
 * one mail's HTML without sending.
 */
export async function sendTestStockHealthSummaryMail(
  companyId: string,
  /** Who gets the test mails: these addresses, or "template" = each mail's template To + CC. */
  recipients: MailRecipients | "template",
  options: { parts?: readonly StockHealthMailPart[]; preview?: StockHealthMailPart } = {},
): Promise<StockHealthSummaryMailResult[]> {
  const mailDate = formatAppIsoDate(new Date());
  const templates = await loadBothTemplates(companyId);
  // Preview shows the HTML only; test sends carry the same attachments as the real mails.
  const attachFor = options.preview ? [] : (options.parts ?? STOCK_HEALTH_MAIL_PARTS);
  const { mails } = await loadMailData(
    companyId,
    mailDate,
    { refresh: false, test: true, attachFor },
    templates,
  );
  const recipientsFor = (part: StockHealthMailPart) =>
    recipients === "template" ? templates[part].recipients : recipients;

  if (options.preview) {
    const mail = mails[options.preview];
    return [
      { companyId, mailDate, recipientCount: 0, part: options.preview, status: "preview", subject: mail.subject, html: mail.html },
    ];
  }

  const results: StockHealthSummaryMailResult[] = [];
  for (const part of options.parts ?? STOCK_HEALTH_MAIL_PARTS) {
    const mail = mails[part];
    const { to, cc } = recipientsFor(part);
    const base = { companyId, mailDate, part, recipientCount: to.length + cc.length, subject: mail.subject };
    if (to.length === 0) {
      results.push({ ...base, status: "skipped_no_recipients" });
      continue;
    }
    const send = await sendStockHealthSummaryEmail({ toEmails: to, ccEmails: cc, ...mail });
    results.push(send.success ? { ...base, status: "sent" } : { ...base, status: "failed", error: send.message });
  }
  return results;
}
