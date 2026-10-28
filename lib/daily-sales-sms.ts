import type { Prisma } from "@prisma/client";

import {
  isReplacementCancel,
  isVoidedFinancialStatus,
  smsCancelMatchesDayPriorPlaced,
  smsCancelMatchesMtdInRange,
  smsCancelMatchesMtdPriorMonth,
} from "@/lib/daily-sales-sms-cancels";
import {
  normalizeRecipientList,
} from "@/lib/daily-sales-sms-recipients";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { sendSms } from "@/lib/hutch-sms";
import { isDashboardSalesOrderEligible } from "@/lib/page-data/dashboard-sales";
import { prisma } from "@/lib/prisma";
import { salesAmountExcludingShipping } from "@/lib/sales-amount-excluding-shipping";

export { salesAmountExcludingShipping } from "@/lib/sales-amount-excluding-shipping";

export { normalizeRecipientList } from "@/lib/daily-sales-sms-recipients";
const REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DailySalesLocationRow = {
  code: string;
  value: number;
};

export type DailySalesCancelBlock = {
  total: number;
  count: number;
  locations: DailySalesLocationRow[];
};

export type DailySalesReport = {
  reportDate: string;
  dayValue: number;
  dayCount: number;
  mtdValue: number;
  /** Month-to-date order count (same eligibility as day count). */
  mtdCount: number;
  /** That day’s sales by location (company / site shortName). */
  dayLocations: DailySalesLocationRow[];
  /** Month-to-date sales by location. */
  locations: DailySalesLocationRow[];
  /** Voided, placed before report date, cancelled on report date. */
  dayPriorPlacedCancels: DailySalesCancelBlock;
  /** Voided, placed before month start, cancelled in MTD. */
  mtdPriorMonthCancels: DailySalesCancelBlock;
  /** Voided, placed in MTD and cancelled in MTD. */
  mtdInRangeCancels: DailySalesCancelBlock;
  messageBody: string;
};

export type DailySalesSmsSendSource = "cron" | "manual" | "preview_test";

export type DailySalesSmsSendStatus =
  | "sent"
  | "failed"
  | "skipped_no_recipients"
  | "skipped_disabled"
  | "skipped_already_sent";

function parseDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function parseDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

/** Previous calendar day in Asia/Colombo as YYYY-MM-DD. */
export function getPreviousColomboReportDate(now = new Date()): string {
  const today = formatAppIsoDate(now);
  const start = parseDayStart(today);
  const prev = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  return formatAppIsoDate(prev);
}

export function monthStartYmd(reportDate: string): string {
  return `${reportDate.slice(0, 7)}-01`;
}

export function isValidReportDate(value: string): boolean {
  if (!REPORT_DATE_RE.test(value)) return false;
  const d = parseDayStart(value);
  return !Number.isNaN(d.getTime()) && formatAppIsoDate(d) === value;
}

export function formatSalesAmount(value: number): string {
  const rounded = Math.round(value);
  return rounded.toLocaleString("en-LK", { maximumFractionDigits: 0 });
}

function emptyCancelBlock(): DailySalesCancelBlock {
  return { total: 0, count: 0, locations: [] };
}

function appendCancelBlock(
  lines: string[],
  title: string,
  block: DailySalesCancelBlock | undefined,
) {
  const row = block ?? emptyCancelBlock();
  lines.push(
    "-----------------------",
    title,
    `Total: ${formatSalesAmount(row.total)}`,
    `Count:        ${row.count}`,
  );
  for (const loc of row.locations) {
    lines.push(`${loc.code}->: ${formatSalesAmount(loc.value)}`);
  }
}

export function formatDailySalesSmsBody(report: Omit<DailySalesReport, "messageBody">): string {
  const month = report.reportDate.slice(0, 7);
  const lines = [
    `Day (${report.reportDate})`,
    `Value:  ${formatSalesAmount(report.dayValue)}`,
    `Count:        ${report.dayCount}`,
    "Day Sales (Location Wise):",
  ];
  for (const row of report.dayLocations) {
    lines.push(`${row.code}->: ${formatSalesAmount(row.value)}`);
  }
  lines.push(
    "-----------------------",
    `MTD Sales: ${formatSalesAmount(report.mtdValue)}`,
    `Count:        ${report.mtdCount}`,
    "MTD Sales (Location Wise):",
  );
  for (const row of report.locations) {
    lines.push(`${row.code}->: ${formatSalesAmount(row.value)}`);
  }
  appendCancelBlock(
    lines,
    `Cancel ${report.reportDate} (placed before)`,
    report.dayPriorPlacedCancels,
  );
  appendCancelBlock(
    lines,
    `Cancel MTD (placed before ${month})`,
    report.mtdPriorMonthCancels,
  );
  appendCancelBlock(
    lines,
    `Cancel MTD (placed in ${month})`,
    report.mtdInRangeCancels,
  );
  return lines.join("\n");
}

function locationRowsFromAgg(
  byLocation: Map<string, number>,
  locationNameById: Map<string, { name: string; shortName: string | null }>,
): DailySalesLocationRow[] {
  const rows: DailySalesLocationRow[] = [];
  for (const [locationId, value] of byLocation) {
    // Keep negatives (same-day returns can make a company net negative).
    if (value === 0) continue;
    const loc = locationNameById.get(locationId);
    rows.push({
      code: locationCode(loc?.shortName ?? null, loc?.name ?? locationId),
      value,
    });
  }
  rows.sort((a, b) => b.value - a.value);
  return rows;
}

function locationCode(shortName: string | null, name: string): string {
  const short = shortName?.trim();
  if (short) return short.slice(0, 20);
  const fallback = name.trim() || "LOC";
  return fallback.slice(0, 12).toUpperCase();
}

export function shouldSkipAutomaticSend(input: {
  enabled: boolean;
  recipients: string[];
  alreadySentSuccessfully: boolean;
}): { skip: true; status: DailySalesSmsSendStatus } | { skip: false } {
  if (!input.enabled) return { skip: true, status: "skipped_disabled" };
  if (input.recipients.length === 0) return { skip: true, status: "skipped_no_recipients" };
  if (input.alreadySentSuccessfully) return { skip: true, status: "skipped_already_sent" };
  return { skip: false };
}

async function aggregateRange(
  companyId: string,
  fromYmd: string,
  toYmd: string,
): Promise<{ total: number; count: number; byLocation: Map<string, number> }> {
  const fromDate = parseDayStart(fromYmd);
  const toDate = parseDayEnd(toYmd);

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      createdAt: { gte: fromDate, lte: toDate },
    },
    select: {
      totalPrice: true,
      sourceName: true,
      financialStatus: true,
      fulfillmentStatus: true,
      fulfillmentStage: true,
      deliveryCompleteAt: true,
      invoiceCompleteAt: true,
      cancelledAt: true,
      companyLocationId: true,
      totalShipping: true,
      shippingLines: true,
      discountCodes: true,
    },
  });

  let total = 0;
  let count = 0;
  const byLocation = new Map<string, number>();

  for (const order of orders) {
    if (!isDashboardSalesOrderEligible(order, "all_orders")) continue;
    const amount = salesAmountExcludingShipping(order) ?? 0;
    if (!Number.isFinite(amount) || amount === 0) continue;
    total += amount;
    count += 1;
    if (order.companyLocationId) {
      byLocation.set(
        order.companyLocationId,
        (byLocation.get(order.companyLocationId) ?? 0) + amount,
      );
    }
  }

  return { total, count, byLocation };
}

function addCancelAmount(
  block: { total: number; count: number; byLocation: Map<string, number> },
  locationId: string | null,
  amount: number,
) {
  block.total += amount;
  block.count += 1;
  if (!locationId) return;
  block.byLocation.set(locationId, (block.byLocation.get(locationId) ?? 0) + amount);
}

async function aggregateCancels(
  companyId: string,
  reportDate: string,
  mtdFromYmd: string,
): Promise<{
  dayPriorPlaced: { total: number; count: number; byLocation: Map<string, number> };
  mtdPriorMonth: { total: number; count: number; byLocation: Map<string, number> };
  mtdInRange: { total: number; count: number; byLocation: Map<string, number> };
}> {
  const empty = () => ({
    total: 0,
    count: 0,
    byLocation: new Map<string, number>(),
  });
  const dayPriorPlaced = empty();
  const mtdPriorMonth = empty();
  const mtdInRange = empty();

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      financialStatus: "voided",
      cancelledAt: {
        gte: parseDayStart(mtdFromYmd),
        lte: parseDayEnd(reportDate),
      },
    },
    select: {
      totalPrice: true,
      createdAt: true,
      cancelledAt: true,
      financialStatus: true,
      replacedByOrderId: true,
      cancelKind: true,
      companyLocationId: true,
      totalShipping: true,
      shippingLines: true,
      discountCodes: true,
    },
  });

  for (const order of orders) {
    if (!isVoidedFinancialStatus(order.financialStatus)) continue;
    if (isReplacementCancel(order)) continue;
    const cancelYmd = formatAppIsoDate(order.cancelledAt);
    const placedYmd = formatAppIsoDate(order.createdAt);
    if (!cancelYmd || !placedYmd) continue;
    const amount = salesAmountExcludingShipping(order) ?? 0;
    if (!Number.isFinite(amount) || amount === 0) continue;

    if (smsCancelMatchesDayPriorPlaced(placedYmd, cancelYmd, reportDate)) {
      addCancelAmount(dayPriorPlaced, order.companyLocationId, amount);
    }
    if (smsCancelMatchesMtdPriorMonth(placedYmd, cancelYmd, mtdFromYmd, reportDate)) {
      addCancelAmount(mtdPriorMonth, order.companyLocationId, amount);
    }
    if (smsCancelMatchesMtdInRange(placedYmd, cancelYmd, mtdFromYmd, reportDate)) {
      addCancelAmount(mtdInRange, order.companyLocationId, amount);
    }
  }

  return { dayPriorPlaced, mtdPriorMonth, mtdInRange };
}

export async function buildDailySalesReport(
  companyId: string,
  reportDate: string,
): Promise<DailySalesReport> {
  if (!isValidReportDate(reportDate)) {
    throw new Error("Invalid reportDate (expected YYYY-MM-DD Asia/Colombo calendar day)");
  }

  const mtdFrom = monthStartYmd(reportDate);
  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    select: { id: true, name: true, shortName: true },
  });
  const locationNameById = new Map(locations.map((l) => [l.id, l]));

  const [dayAgg, mtdAgg, cancelAgg] = await Promise.all([
    aggregateRange(companyId, reportDate, reportDate),
    aggregateRange(companyId, mtdFrom, reportDate),
    aggregateCancels(companyId, reportDate, mtdFrom),
  ]);

  const toCancelBlock = (row: {
    total: number;
    count: number;
    byLocation: Map<string, number>;
  }): DailySalesCancelBlock => ({
    total: row.total,
    count: row.count,
    locations: locationRowsFromAgg(row.byLocation, locationNameById),
  });

  const base = {
    reportDate,
    dayValue: dayAgg.total,
    dayCount: dayAgg.count,
    mtdValue: mtdAgg.total,
    mtdCount: mtdAgg.count,
    dayLocations: locationRowsFromAgg(dayAgg.byLocation, locationNameById),
    locations: locationRowsFromAgg(mtdAgg.byLocation, locationNameById),
    dayPriorPlacedCancels: toCancelBlock(cancelAgg.dayPriorPlaced),
    mtdPriorMonthCancels: toCancelBlock(cancelAgg.mtdPriorMonth),
    mtdInRangeCancels: toCancelBlock(cancelAgg.mtdInRange),
  };

  return { ...base, messageBody: formatDailySalesSmsBody(base) };
}

export async function hasSuccessfulDailySalesSmsSend(
  companyId: string,
  reportDate: string,
): Promise<boolean> {
  const row = await prisma.dailySalesSmsSendLog.findFirst({
    where: { companyId, reportDate, status: "sent" },
    select: { id: true },
  });
  return Boolean(row);
}

export async function writeDailySalesSmsSendLog(input: {
  companyId: string;
  reportDate: string;
  status: DailySalesSmsSendStatus;
  messageBody?: string | null;
  recipients?: string[];
  errorSummary?: string | null;
  source: DailySalesSmsSendSource;
}): Promise<void> {
  await prisma.dailySalesSmsSendLog.create({
    data: {
      companyId: input.companyId,
      reportDate: input.reportDate,
      status: input.status,
      messageBody: input.messageBody?.slice(0, 4000) ?? null,
      recipientCount: input.recipients?.length ?? 0,
      recipients: (input.recipients ?? []) as Prisma.InputJsonValue,
      errorSummary: input.errorSummary?.slice(0, 1000) ?? null,
      source: input.source,
    },
  });
}

export async function getDailySalesSmsConfig(companyId: string) {
  return prisma.dailySalesSmsConfig.findUnique({ where: { companyId } });
}

export async function upsertDailySalesSmsConfig(input: {
  companyId: string;
  enabled: boolean;
  recipients: string[];
}) {
  return prisma.dailySalesSmsConfig.upsert({
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

export async function sendDailySalesSmsToRecipients(input: {
  companyId: string;
  reportDate: string;
  recipients: string[];
  messageBody: string;
  source: DailySalesSmsSendSource;
  sentById?: string;
}): Promise<{ ok: boolean; errorSummary?: string }> {
  const errors: string[] = [];
  for (const phone of input.recipients) {
    const result = await sendSms(input.companyId, phone, input.messageBody, input.sentById);
    if (!result.success) {
      errors.push(`${phone}: ${result.message}`);
    }
  }

  if (errors.length === input.recipients.length) {
    await writeDailySalesSmsSendLog({
      companyId: input.companyId,
      reportDate: input.reportDate,
      status: "failed",
      messageBody: input.messageBody,
      recipients: input.recipients,
      errorSummary: errors.join("; "),
      source: input.source,
    });
    return { ok: false, errorSummary: errors.join("; ") };
  }

  await writeDailySalesSmsSendLog({
    companyId: input.companyId,
    reportDate: input.reportDate,
    status: "sent",
    messageBody: input.messageBody,
    recipients: input.recipients,
    errorSummary: errors.length > 0 ? errors.join("; ") : null,
    source: input.source,
  });
  return { ok: true, errorSummary: errors.length > 0 ? errors.join("; ") : undefined };
}

/** Cron/manual orchestration for one company. */
export async function runDailySalesSmsForCompany(input: {
  companyId: string;
  reportDate: string;
  source: DailySalesSmsSendSource;
  force?: boolean;
  sentById?: string;
}): Promise<{
  status: DailySalesSmsSendStatus | "sent" | "failed";
  report?: DailySalesReport;
  errorSummary?: string;
}> {
  const config = await getDailySalesSmsConfig(input.companyId);
  const recipients = normalizeRecipientList(config?.recipients);
  const enabled = config?.enabled ?? false;
  const alreadySent =
    !input.force && input.source === "cron"
      ? await hasSuccessfulDailySalesSmsSend(input.companyId, input.reportDate)
      : false;

  const skip = shouldSkipAutomaticSend({
    enabled: input.source === "cron" ? enabled : true,
    recipients,
    alreadySentSuccessfully: alreadySent,
  });

  if (skip.skip) {
    if (input.source === "cron" && skip.status !== "skipped_already_sent") {
      await writeDailySalesSmsSendLog({
        companyId: input.companyId,
        reportDate: input.reportDate,
        status: skip.status,
        recipients,
        source: input.source,
      });
    }
    return { status: skip.status };
  }

  // Manual/resend/test still need recipients
  if (recipients.length === 0) {
    return { status: "skipped_no_recipients" };
  }

  if (input.source === "cron" && !enabled) {
    return { status: "skipped_disabled" };
  }

  const report = await buildDailySalesReport(input.companyId, input.reportDate);
  const sendResult = await sendDailySalesSmsToRecipients({
    companyId: input.companyId,
    reportDate: input.reportDate,
    recipients,
    messageBody: report.messageBody,
    source: input.source,
    sentById: input.sentById,
  });

  return {
    status: sendResult.ok ? "sent" : "failed",
    report,
    errorSummary: sendResult.errorSummary,
  };
}
