import "server-only";

import { Prisma } from "@prisma/client";

import { parseEmailAddressList } from "@/lib/email-templates/render";
import { formatAppDateTime, formatAppIsoDate, formatAppIsoDateTime } from "@/lib/format-datetime";
import { loadSkuCatalog } from "@/lib/item-trends/catalog";
import {
  computeStockTrendMetrics,
  currentStockBySku,
  fetchStockLedgerEntries,
  type StockLedgerEntry,
} from "@/lib/item-trends/stock-trends";
import { getLiveStockBalances } from "@/lib/item-trends/stock-balance-report";
import { sendStockHealthSummaryEmail } from "@/lib/maileroo";
import {
  buildNewlyAddedReview,
  monthKeyOf,
  newlyAddedReviewSendDate,
  NEWLY_ADDED_STATUS,
  unitsByMonth,
  type NewlyAddedReview,
} from "@/lib/newly-added-review/calc";
import { buildNewlyAddedReviewMail, newlyAddedReviewPlaceholders } from "@/lib/newly-added-review/mail-html";
import { NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE } from "@/lib/newly-added-review/mail-templates";
import { buildNewlyAddedReviewWorkbook } from "@/lib/newly-added-review/workbook";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { resolveProductPriority } from "@/lib/osf/assist-window";
import { prisma } from "@/lib/prisma";
import { normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import { getSalesBudgetSalesData } from "@/lib/sales-budget/sales-data";
import { stockHealthStatusOf } from "@/lib/stock-health/calc";

type MailRecipients = { to: string[]; cc: string[] };
type MailAttachment = { fileName: string; contentType: string; contentBase64: string };

/**
 * The saved Email Template (Settings → Email Templates → "Newly Added Priority Review"):
 * Subject / Body (blank → default) and To / CC (none until someone adds them).
 */
async function loadTemplate(companyId: string) {
  const [stored, company] = await Promise.all([
    prisma.emailTemplate.findUnique({
      where: { companyId_key: { companyId, key: NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.key } },
      select: { name: true, subject: true, bodyHtml: true, recipients: true, ccRecipients: true },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  const to = parseEmailAddressList(stored?.recipients);
  const cc = parseEmailAddressList(stored?.ccRecipients).filter((email) => !to.includes(email));
  return {
    name: stored?.name || NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.name,
    subject: stored?.subject ?? null,
    bodyHtml: stored?.bodyHtml ?? null,
    recipients: { to, cc } as MailRecipients,
    companyName: company?.name ?? "",
  };
}

function xlsxAttachment({ fileName, buffer }: { fileName: string; buffer: Buffer }): MailAttachment {
  return { fileName, contentType: XLSX_CONTENT_TYPE, contentBase64: buffer.toString("base64") };
}

/**
 * Send log: the Stock Health mails' table (no new table), part = this, mailDate = "YYYY-MM"
 * (the mail month) — so one send per company per month.
 */
const LOG_PART = "newly_added_review";
const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type NewlyAddedReviewMailResult = {
  companyId: string;
  mailMonth: string;
  status: "sent" | "failed" | "preview" | "skipped_no_recipients" | "skipped_already_sent" | "skipped_wrong_day";
  recipientCount: number;
  subject?: string;
  html?: string;
  needsCheck?: number;
  allNewlyAdded?: number;
  error?: string;
};

/**
 * Every variant SKU currently Newly Added (Item Trends catalog + priority), with Item Trends'
 * created date (earliest stock-in, every warehouse / ERP) and live stock (every warehouse).
 */
export async function loadNewlyAddedReview(companyId: string, mailMonth: string): Promise<NewlyAddedReview> {
  const catalog = await loadSkuCatalog(companyId);
  const candidates = [...catalog.values()]
    .map((entry) => ({ entry, priority: resolveProductPriority(entry.erp1ProductPriority, entry.erp2ProductPriority) }))
    .filter(({ priority }) => stockHealthStatusOf(priority) === NEWLY_ADDED_STATUS);
  if (candidates.length === 0) return buildNewlyAddedReview([], mailMonth);

  const instances = await getAllOsfErpInstances(companyId);
  const skus = candidates.map(({ entry }) => entry.sku);
  const [perInstanceRows, balanceRows, sales] = await Promise.all([
    // No channel = every warehouse (Online and Shop together).
    Promise.all(instances.map((instance) => fetchStockLedgerEntries(instance.cfg, skus, null))),
    getLiveStockBalances(companyId),
    // Sales Budget's counted sales (completed months), for Sheet 1's Max Sale Qty.
    getSalesBudgetSalesData(companyId),
  ]);
  const liveStock = currentStockBySku(balanceRows, "all");

  const ledgerBySku = new Map<string, StockLedgerEntry[]>();
  for (const rows of perInstanceRows) {
    for (const row of rows) {
      const list = ledgerBySku.get(row.itemCode);
      if (list) list.push(row);
      else ledgerBySku.set(row.itemCode, [row]);
    }
  }

  return buildNewlyAddedReview(
    candidates.map(({ entry, priority }) => {
      const ledger = ledgerBySku.get(entry.sku) ?? [];
      return {
        sku: entry.sku,
        productTitle: entry.title,
        priority,
        // The range only bounds wasRestocked, which isn't used here (same as Item Trends' lookup).
        createdDate: ledger.length ? computeStockTrendMetrics(ledger, { fromYmd: "", toYmd: "" }).createdDate : null,
        currentStock: liveStock.get(entry.sku) ?? 0,
      };
    }),
    mailMonth,
    (sku) => unitsByMonth(sales.bySku.get(normalizeSkuKey(sku))),
  );
}

/** The mail month for today (Asia/Colombo), "YYYY-MM". */
export function currentMailMonth(now = new Date()): string {
  return monthKeyOf(formatAppIsoDate(now))!;
}

async function buildMail(
  companyId: string,
  mailMonth: string,
  template: Awaited<ReturnType<typeof loadTemplate>>,
  options: { test: boolean; attach: boolean },
) {
  const review = await loadNewlyAddedReview(companyId, mailMonth);
  const mail = buildNewlyAddedReviewMail(review, {
    test: options.test,
    template,
    companyName: template.companyName,
    generatedAt: formatAppDateTime(new Date()),
  });
  const attachments = options.attach
    ? [xlsxAttachment(await buildNewlyAddedReviewWorkbook(review, formatAppIsoDateTime(new Date())))]
    : [];
  return { review, mail: { ...mail, attachments } };
}

const logKey = (companyId: string, mailMonth: string) => ({
  companyId_mailDate_part: { companyId, mailDate: mailMonth, part: LOG_PART },
});

async function alreadySent(companyId: string, mailMonth: string): Promise<boolean> {
  const row = await prisma.stockHealthSummaryMail.findUnique({ where: logKey(companyId, mailMonth), select: { status: true } });
  return row !== null && row.status !== "failed";
}

/** Claims this month's send (a failed one can be claimed again). False = someone else has it. */
async function claimSend(companyId: string, mailMonth: string, recipients: MailRecipients): Promise<boolean> {
  const list = `To: ${recipients.to.join(", ")}${recipients.cc.length ? ` | CC: ${recipients.cc.join(", ")}` : ""}`;
  const data = { status: "sending", recipients: list, error: null };
  try {
    await prisma.stockHealthSummaryMail.create({ data: { companyId, mailDate: mailMonth, part: LOG_PART, ...data } });
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }
  const { count } = await prisma.stockHealthSummaryMail.updateMany({
    where: { companyId, mailDate: mailMonth, part: LOG_PART, status: "failed" },
    data,
  });
  return count > 0;
}

/**
 * The scheduled send for one company: at most once per month (Asia/Colombo), to the Email
 * Template's To / CC (Settings → Email Templates). No To → not sent, logged.
 */
export async function sendScheduledNewlyAddedReviewMail(
  companyId: string,
  mailMonth = currentMailMonth(),
): Promise<NewlyAddedReviewMailResult> {
  const template = await loadTemplate(companyId);
  const recipients = template.recipients;
  const result = (status: NewlyAddedReviewMailResult["status"], extra: Partial<NewlyAddedReviewMailResult> = {}) => ({
    companyId,
    mailMonth,
    status,
    recipientCount: recipients.to.length + recipients.cc.length,
    ...extra,
  });

  if (recipients.to.length === 0) {
    console.warn(
      `[newly-added-review-mail] Email Template "${template.name}" (${NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.key}) has no To recipients — mail not sent (company ${companyId}, ${mailMonth}). Add them in Settings → Email Templates.`,
    );
    return result("skipped_no_recipients");
  }
  if (await alreadySent(companyId, mailMonth)) {
    console.log(`[newly-added-review-mail] already sent for ${mailMonth} (company ${companyId}) — skipped.`);
    return result("skipped_already_sent");
  }

  // The slow ERP load happens before the claim, so the claim → send window is short.
  const { review, mail } = await buildMail(companyId, mailMonth, template, { test: false, attach: true });
  if (!(await claimSend(companyId, mailMonth, recipients))) return result("skipped_already_sent");

  const counts = { needsCheck: review.needsCheck.length, allNewlyAdded: review.all.length, subject: mail.subject };
  const send = await sendStockHealthSummaryEmail({ toEmails: recipients.to, ccEmails: recipients.cc, ...mail });
  if (!send.success) {
    await prisma.stockHealthSummaryMail.update({
      where: logKey(companyId, mailMonth),
      data: { status: "failed", error: send.message ?? "Send failed" },
    });
    console.error(`[newly-added-review-mail] failed for ${mailMonth} (company ${companyId}):`, send.message);
    return result("failed", { ...counts, error: send.message });
  }
  try {
    await prisma.stockHealthSummaryMail.update({ where: logKey(companyId, mailMonth), data: { status: "sent" } });
  } catch (error) {
    // The mail went out; the row stays "sending", so it is not sent again.
    console.error(`[newly-added-review-mail] sent, but marking it sent failed (${mailMonth}, company ${companyId}):`, error);
  }
  return result("sent", counts);
}

/**
 * The cron (every Tuesday): sends only on the month's send day — the first Tuesday, or the
 * month's override (newlyAddedReviewSendDate); other Tuesdays do nothing.
 */
export async function sendScheduledNewlyAddedReviewMailForAllCompanies(
  today = formatAppIsoDate(new Date()),
): Promise<NewlyAddedReviewMailResult[]> {
  const mailMonth = monthKeyOf(today)!;
  const sendDate = newlyAddedReviewSendDate(mailMonth);
  if (today !== sendDate) {
    console.log(`[newly-added-review-mail] ${today} is not the ${mailMonth} send day (${sendDate}) — nothing sent.`);
    return [{ companyId: "-", mailMonth, status: "skipped_wrong_day", recipientCount: 0 }];
  }
  const companies = await prisma.company.findMany({ where: { erpnextInstances: { some: {} } }, select: { id: true } });
  const results: NewlyAddedReviewMailResult[] = [];
  for (const company of companies) {
    try {
      results.push(await sendScheduledNewlyAddedReviewMail(company.id, mailMonth));
    } catch (error) {
      console.error(`[newly-added-review-mail] failed for company ${company.id}:`, error);
      results.push({
        companyId: company.id,
        mailMonth,
        status: "failed",
        recipientCount: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

/** The test link's `?excel=1`: the attachment itself, built exactly as the mail builds it. Sends nothing. */
export async function buildNewlyAddedReviewExcel(
  companyId: string,
  mailMonth = currentMailMonth(),
): Promise<{ fileName: string; buffer: Buffer }> {
  const review = await loadNewlyAddedReview(companyId, mailMonth);
  return buildNewlyAddedReviewWorkbook(review, formatAppIsoDateTime(new Date()));
}

/**
 * On demand (the test link): preview or send now, marked [TEST]. Never written to the send log,
 * so it never stops (or counts as) the month's scheduled send. `mailMonth` can be any month,
 * to see what that month's mail would list. "template" = the Email Template's To / CC.
 */
export async function sendTestNewlyAddedReviewMail(
  companyId: string,
  to: string[] | "template",
  options: { preview?: boolean; mailMonth?: string } = {},
): Promise<NewlyAddedReviewMailResult> {
  const mailMonth = options.mailMonth ?? currentMailMonth();
  const template = await loadTemplate(companyId);
  const recipients: MailRecipients = to === "template" ? template.recipients : { to, cc: [] };
  const { review, mail } = await buildMail(companyId, mailMonth, template, { test: true, attach: !options.preview });
  const base = {
    companyId,
    mailMonth,
    recipientCount: recipients.to.length + recipients.cc.length,
    subject: mail.subject,
    needsCheck: review.needsCheck.length,
    allNewlyAdded: review.all.length,
  };
  if (options.preview) return { ...base, status: "preview", html: mail.html };
  if (recipients.to.length === 0) return { ...base, status: "skipped_no_recipients" };
  const send = await sendStockHealthSummaryEmail({ toEmails: recipients.to, ccEmails: recipients.cc, ...mail });
  return send.success ? { ...base, status: "sent" } : { ...base, status: "failed", error: send.message };
}

/**
 * Settings → Email Templates "Send test mail" for this key: the real placeholder values (this
 * month's review) to fill the template being edited, plus the same Excel as the scheduled mail.
 */
export async function loadNewlyAddedReviewTestPlaceholders(
  companyId: string,
  key: string,
): Promise<{ placeholders: Record<string, string>; attachments: MailAttachment[] } | null> {
  if (key !== NEWLY_ADDED_PRIORITY_REVIEW_TEMPLATE.key) return null;
  const [review, company] = await Promise.all([
    loadNewlyAddedReview(companyId, currentMailMonth()),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  return {
    placeholders: newlyAddedReviewPlaceholders(review, {
      companyName: company?.name ?? "",
      generatedAt: formatAppDateTime(new Date()),
    }),
    attachments: [xlsxAttachment(await buildNewlyAddedReviewWorkbook(review, formatAppIsoDateTime(new Date())))],
  };
}
