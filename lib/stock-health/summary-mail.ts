import "server-only";

import { Prisma } from "@prisma/client";

import { formatAppDate, formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { sendStockHealthSummaryEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { summarizeShopStockLocationByPriority } from "@/lib/shop-stock-status/calc";
import { ONLINE_STOCK_COLUMNS, SHOP_STOCK_COLUMNS } from "@/lib/shop-stock-status/config";
import { loadShopStockStatus } from "@/lib/shop-stock-status/load";
import { summarizeByStatus, summarizeRopStatus } from "@/lib/stock-health/calc";
import { buildDiscontinueMovement, type SkuStatus } from "@/lib/stock-health/discontinue-movement";
import { currentMonthName, loadStockHealthRopData } from "@/lib/stock-health/rop-status";
import {
  buildStockHealthSummaryMail,
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

/**
 * Env vars (comma-separated addresses), per mail: To and CC. Mail 1 (Weekly Summary, Tuesday)
 * and mail 2 (Stock Availability Status, Monday) can go to completely different people.
 */
export const STOCK_HEALTH_MAIL_ENV: Record<StockHealthMailPart, { to: string; cc: string }> = {
  weekly: { to: "STOCK_HEALTH_WEEKLY_MAIL_TO", cc: "STOCK_HEALTH_WEEKLY_MAIL_CC" },
  rop: { to: "STOCK_HEALTH_AVAILABILITY_MAIL_TO", cc: "STOCK_HEALTH_AVAILABILITY_MAIL_CC" },
};

export type MailRecipients = { to: string[]; cc: string[] };

/** One mail's To + CC from its env vars (CC never repeats a To address). */
export function stockHealthMailRecipientsFor(part: StockHealthMailPart): MailRecipients {
  const to = parseMailList(process.env[STOCK_HEALTH_MAIL_ENV[part].to]);
  const cc = parseMailList(process.env[STOCK_HEALTH_MAIL_ENV[part].cc]).filter((e) => !to.includes(e));
  return { to, cc };
}

/** "a@x.lk, b@y.lk" → unique, lower-case addresses (anything without "@" dropped). */
export function parseMailList(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(/[,;\s]+/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes("@")),
    ),
  ];
}

/** A YYYY-MM-DD Colombo day → display date (same format as the screen). */
function dateLabelOf(isoDate: string): string {
  return formatAppDate(`${isoDate}T12:00:00+05:30`);
}

type BuiltMail = { subject: string; html: string; plain: string };

/**
 * Both mails' figures, from the same functions as the screen: Weekly Summary =
 * `summarizeByStatus`, ROP Status = `summarizeRopStatus`, over one load of the live ERP data,
 * so both mails use the same stock. `refresh` regenerates the ERP stock report.
 */
async function loadMailData(
  companyId: string,
  mailDate: string,
  options: { refresh: boolean; test: boolean },
): Promise<{
  current: ReturnType<typeof summarizeByStatus>;
  skuStatuses: SkuStatus[];
  mails: Record<StockHealthMailPart, BuiltMail>;
}> {
  const [data, previous] = await Promise.all([
    loadStockHealthRopData(companyId, { refresh: options.refresh }),
    loadPreviousStockHealthSnapshot(companyId, mailDate),
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
    locations,
    // null = no item-level snapshot from last week yet → the mail says tracking starts next week.
    discontinue:
      previous && previousSkus.length > 0
        ? {
            previousDateLabel: dateLabelOf(previous.snapshotDate),
            movement: buildDiscontinueMovement(previousSkus, skuStatuses),
          }
        : null,
  };
  return {
    current,
    skuStatuses,
    mails: {
      weekly: buildStockHealthSummaryMail(mailData, "weekly"),
      rop: buildStockHealthSummaryMail(mailData, "rop"),
    },
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
 * that mail's To / CC env vars (STOCK_HEALTH_MAIL_ENV). When mail 1 goes out, this week's Weekly Summary (totals + each
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

  const recipients = stockHealthMailRecipientsFor(part);
  if (recipients.to.length === 0) {
    console.warn(
      `[stock-health-mail] ${STOCK_HEALTH_MAIL_ENV[part].to} is empty — Stock Health ${part} mail not sent (company ${companyId}, ${mailDate}).`,
    );
    return result("skipped_no_recipients");
  }
  const recipientCount = recipients.to.length + recipients.cc.length;
  if (await alreadySent(companyId, mailDate, part)) {
    console.log(`[stock-health-mail] ${part} mail already sent for ${mailDate} (company ${companyId}) — skipped.`);
    return result("skipped_already_sent", { recipientCount });
  }

  // The slow ERP load happens before the claim, so the claim → send window is short.
  const { current, skuStatuses, mails } = await loadMailData(companyId, mailDate, { refresh: true, test: false });
  const mail = mails[part];
  if (!(await claimSend(companyId, mailDate, part, recipients))) {
    return result("skipped_already_sent", { recipientCount });
  }

  const send = await sendStockHealthSummaryEmail({ toEmails: recipients.to, ccEmails: recipients.cc, ...mail });
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
  return result("sent", { recipientCount, subject: mail.subject });
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
  /** Who gets each test mail (e.g. you, or that mail's configured To + CC). */
  recipientsFor: (part: StockHealthMailPart) => MailRecipients,
  options: { parts?: readonly StockHealthMailPart[]; preview?: StockHealthMailPart } = {},
): Promise<StockHealthSummaryMailResult[]> {
  const mailDate = formatAppIsoDate(new Date());
  const { mails } = await loadMailData(companyId, mailDate, { refresh: false, test: true });

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
