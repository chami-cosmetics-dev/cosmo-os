import type { Prisma } from "@prisma/client";

import {
  buildFailedErpSyncWhere,
} from "@/lib/failed-erp-sync-auto-retry";
import {
  ERP_SYNC_INTERRUPTED_MESSAGE,
  ERP_SYNC_STUCK_PENDING_UI_LABEL,
} from "@/lib/erp-sync-failure-copy";
import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { resolveShopifyShippingLineTotal } from "@/lib/order-shipping-display";
import { prisma } from "@/lib/prisma";
import { orderHasFreeShippingCoupon } from "@/lib/shopify-discount-codes";
import { emailSchema } from "@/lib/validation";

const MAX_RECIPIENTS = 20;
const REPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTML_BODY_MAX = 200_000;

export type ErpSyncFailureEmailSource = "cron" | "manual" | "preview_test";

export type ErpSyncFailureEmailSendStatus =
  | "sent"
  | "failed"
  | "skipped_no_recipients"
  | "skipped_disabled"
  | "skipped_no_failures"
  | "skipped_already_sent";

export type ErpSyncFailureCurrencyTotals = {
  currency: string;
  count: number;
  sumIncl: number;
  sumShipping: number;
  sumExcl: number;
};

export type ErpSyncFailureOrderRow = {
  id: string;
  orderName: string;
  shopifyOrderId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  locationName: string;
  orderAt: string;
  reason: string;
  failedAt: string | null;
  retryStatus: string;
  amountIncl: number;
  shipping: number;
  amountExcl: number;
  currency: string;
};

export type ErpSyncFailureReportSnapshot = {
  companyId: string;
  companyName: string;
  reportDate: string;
  cutoffLabel: string;
  generatedAt: string;
  orderCount: number;
  orders: ErpSyncFailureOrderRow[];
  totalsByCurrency: ErpSyncFailureCurrencyTotals[];
  subject: string;
  htmlBody: string;
  plainBody: string;
};

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

export function isValidReportDate(value: string): boolean {
  if (!REPORT_DATE_RE.test(value)) return false;
  const d = parseDayStart(value);
  return !Number.isNaN(d.getTime()) && formatAppIsoDate(d) === value;
}

export function normalizeEmailRecipientList(raw: unknown): string[] {
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

export function resolveFailureReportAmounts(input: {
  totalPrice: string | number;
  totalShipping?: string | number | null;
  shippingLines?: unknown;
  discountCodes?: unknown;
  subtotalPrice?: string | number | null;
}): { amountIncl: number; shipping: number; amountExcl: number } {
  // Use stored order total as inclusive of shipping (same basis as daily sales SMS).
  const inclParsed = parseFloat(String(input.totalPrice));
  const amountIncl = Number.isFinite(inclParsed) ? Math.round(inclParsed * 100) / 100 : 0;

  let shipping = 0;
  if (orderHasFreeShippingCoupon(input.discountCodes)) {
    shipping = 0;
  } else {
    const fromLines = resolveShopifyShippingLineTotal(input.shippingLines);
    if (fromLines > 0) {
      shipping = fromLines;
    } else {
      const stored = parseFloat(String(input.totalShipping ?? "0"));
      shipping = Number.isFinite(stored) && stored > 0 ? stored : 0;
    }
  }
  shipping = Math.round(Math.min(Math.max(0, shipping), amountIncl) * 100) / 100;
  const amountExcl = Math.round(Math.max(0, amountIncl - shipping) * 100) / 100;
  return { amountIncl, shipping, amountExcl };
}

export function groupTotalsByCurrency(
  orders: Array<{ currency: string; amountIncl: number; shipping: number; amountExcl: number }>,
): ErpSyncFailureCurrencyTotals[] {
  const map = new Map<string, ErpSyncFailureCurrencyTotals>();
  for (const order of orders) {
    const currency = (order.currency || "LKR").toUpperCase();
    const row = map.get(currency) ?? {
      currency,
      count: 0,
      sumIncl: 0,
      sumShipping: 0,
      sumExcl: 0,
    };
    row.count += 1;
    row.sumIncl += order.amountIncl;
    row.sumShipping += order.shipping;
    row.sumExcl += order.amountExcl;
    map.set(currency, row);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      sumIncl: Math.round(row.sumIncl * 100) / 100,
      sumShipping: Math.round(row.sumShipping * 100) / 100,
      sumExcl: Math.round(row.sumExcl * 100) / 100,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function decideErpSyncFailureEmailSkip(input: {
  enabled: boolean;
  recipients: string[];
  orderCount: number;
  alreadySent: boolean;
  force?: boolean;
  source: ErpSyncFailureEmailSource;
}): ErpSyncFailureEmailSendStatus | null {
  if (!input.enabled) return "skipped_disabled";
  if (input.recipients.length === 0) return "skipped_no_recipients";
  if (input.orderCount === 0) return "skipped_no_failures";
  if (
    input.alreadySent &&
    !input.force &&
    input.source === "cron"
  ) {
    return "skipped_already_sent";
  }
  return null;
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRetryStatus(input: {
  erpnextSyncNextAutoRetryAt: Date | null;
  erpnextSyncAutoRetryCount: number;
}): string {
  if (input.erpnextSyncNextAutoRetryAt) {
    return `Auto-retry #${input.erpnextSyncAutoRetryCount + 1} at ${formatAppDateTime(input.erpnextSyncNextAutoRetryAt)}`;
  }
  if (input.erpnextSyncAutoRetryCount > 0) {
    return `Auto-retry exhausted (${input.erpnextSyncAutoRetryCount} attempts)`;
  }
  return "Manual retry required";
}

function resolveFailureReason(input: {
  erpnextSyncError: string | null;
  erpnextInvoiceId: string | null;
}): string {
  if (input.erpnextSyncError?.trim()) return input.erpnextSyncError.trim();
  if (input.erpnextInvoiceId === "pending") return ERP_SYNC_STUCK_PENDING_UI_LABEL;
  if (input.erpnextInvoiceId === "pending_approval") {
    return "Awaiting ERP sync — payment was approved";
  }
  return ERP_SYNC_INTERRUPTED_MESSAGE;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildErpSyncFailureEmailSubject(input: {
  companyName: string;
  reportDate: string;
  orderCount: number;
  isTest?: boolean;
}): string {
  const base = `ERP sync failures — ${input.companyName} — ${input.reportDate} (${input.orderCount} order${input.orderCount === 1 ? "" : "s"})`;
  return input.isTest ? `[TEST] ${base}` : base;
}

export function formatErpSyncFailureEmailBodies(snapshot: {
  companyName: string;
  reportDate: string;
  cutoffLabel: string;
  generatedAt: string;
  orders: ErpSyncFailureOrderRow[];
  totalsByCurrency: ErpSyncFailureCurrencyTotals[];
}): { htmlBody: string; plainBody: string } {
  const summaryHtml = snapshot.totalsByCurrency
    .map(
      (t) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(t.currency)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${t.count}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${escapeHtml(formatMoney(t.sumIncl, t.currency))}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${escapeHtml(formatMoney(t.sumShipping, t.currency))}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${escapeHtml(formatMoney(t.sumExcl, t.currency))}</td>
      </tr>`,
    )
    .join("");

  const orderRows = snapshot.orders
    .map(
      (o) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(o.orderName)}<br/><span style="color:#666;font-size:12px;">${escapeHtml(o.shopifyOrderId)}</span></td>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(o.customerEmail ?? "—")}<br/><span style="color:#666;font-size:12px;">${escapeHtml(o.customerPhone ?? "")}</span></td>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(o.locationName)}</td>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(formatAppDateTime(o.orderAt))}</td>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(o.reason)}</td>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(o.failedAt ? formatAppDateTime(o.failedAt) : "—")}</td>
        <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(o.retryStatus)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${escapeHtml(formatMoney(o.amountIncl, o.currency))}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${escapeHtml(formatMoney(o.shipping, o.currency))}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${escapeHtml(formatMoney(o.amountExcl, o.currency))}</td>
      </tr>`,
    )
    .join("");

  const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#1a1a1a;">ERP sync failures</h2>
  <p><strong>Company:</strong> ${escapeHtml(snapshot.companyName)}<br/>
  <strong>Report date:</strong> ${escapeHtml(snapshot.reportDate)} (Asia/Colombo)<br/>
  <strong>Cutoff:</strong> ${escapeHtml(snapshot.cutoffLabel)}<br/>
  <strong>Generated:</strong> ${escapeHtml(formatAppDateTime(snapshot.generatedAt))}<br/>
  <strong>Failed orders:</strong> ${snapshot.orders.length}</p>
  <h3>Totals by currency</h3>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <thead>
      <tr>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;background:#f9f9f9;">Currency</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;background:#f9f9f9;">Count</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;background:#f9f9f9;">Incl. shipping</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;background:#f9f9f9;">Shipping</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;background:#f9f9f9;">Excl. shipping</th>
      </tr>
    </thead>
    <tbody>${summaryHtml || `<tr><td colspan="5" style="padding:8px;border:1px solid #ddd;">No failures</td></tr>`}</tbody>
  </table>
  <h3>Failed orders</h3>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;">
    <thead>
      <tr>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;background:#f9f9f9;">Order</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;background:#f9f9f9;">Customer</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;background:#f9f9f9;">Location</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;background:#f9f9f9;">Order time</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;background:#f9f9f9;">Reason</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;background:#f9f9f9;">Failed at</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left;background:#f9f9f9;">Auto-retry</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;background:#f9f9f9;">Incl.</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;background:#f9f9f9;">Ship</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right;background:#f9f9f9;">Excl.</th>
      </tr>
    </thead>
    <tbody>${orderRows || `<tr><td colspan="10" style="padding:8px;border:1px solid #ddd;">No failures</td></tr>`}</tbody>
  </table>
</body>
</html>`;

  const plainLines = [
    `ERP sync failures — ${snapshot.companyName}`,
    `Report date: ${snapshot.reportDate} (Asia/Colombo)`,
    `Cutoff: ${snapshot.cutoffLabel}`,
    `Generated: ${formatAppDateTime(snapshot.generatedAt)}`,
    `Failed orders: ${snapshot.orders.length}`,
    "",
    "Totals by currency:",
    ...snapshot.totalsByCurrency.map(
      (t) =>
        `${t.currency}: count=${t.count}; incl=${formatMoney(t.sumIncl, t.currency)}; shipping=${formatMoney(t.sumShipping, t.currency)}; excl=${formatMoney(t.sumExcl, t.currency)}`,
    ),
    "",
    "Orders:",
    ...snapshot.orders.map(
      (o) =>
        `${o.orderName} | ${o.customerEmail ?? "—"} | ${o.locationName} | ${o.reason} | incl ${formatMoney(o.amountIncl, o.currency)} | ship ${formatMoney(o.shipping, o.currency)} | excl ${formatMoney(o.amountExcl, o.currency)}`,
    ),
  ];

  return { htmlBody, plainBody: plainLines.join("\n") };
}

export async function buildErpSyncFailureReportSnapshot(
  companyId: string,
  reportDate: string,
  options?: { isTest?: boolean },
): Promise<ErpSyncFailureReportSnapshot> {
  if (!isValidReportDate(reportDate)) {
    throw new Error("Invalid reportDate (expected YYYY-MM-DD Asia/Colombo calendar day)");
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("Company not found");

  const dayStart = parseDayStart(reportDate);
  const dayEnd = parseDayEnd(reportDate);
  const where: Prisma.OrderWhereInput = {
    AND: [
      buildFailedErpSyncWhere(companyId),
      { createdAt: { gte: dayStart, lte: dayEnd } },
      { OR: [{ cancelledAt: null }, { cancelledAt: { gt: dayEnd } }] },
    ],
  };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      customerEmail: true,
      customerPhone: true,
      createdAt: true,
      totalPrice: true,
      subtotalPrice: true,
      totalShipping: true,
      shippingLines: true,
      discountCodes: true,
      currency: true,
      erpnextInvoiceId: true,
      erpnextSyncError: true,
      erpnextSyncFailedAt: true,
      erpnextSyncStartedAt: true,
      erpnextSyncAutoRetryCount: true,
      erpnextSyncNextAutoRetryAt: true,
      companyLocation: { select: { name: true } },
    },
  });

  const rows: ErpSyncFailureOrderRow[] = orders.map((order) => {
    const amounts = resolveFailureReportAmounts({
      totalPrice: order.totalPrice.toString(),
      totalShipping: order.totalShipping?.toString() ?? null,
      shippingLines: order.shippingLines,
      discountCodes: order.discountCodes,
      subtotalPrice: order.subtotalPrice?.toString() ?? null,
    });
    const failedAt =
      order.erpnextSyncFailedAt?.toISOString() ??
      (order.erpnextInvoiceId === "pending"
        ? order.erpnextSyncStartedAt?.toISOString() ?? null
        : null);
    return {
      id: order.id,
      orderName: order.name ?? order.orderNumber ?? order.shopifyOrderId,
      shopifyOrderId: order.shopifyOrderId,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      locationName: order.companyLocation?.name ?? "—",
      orderAt: order.createdAt.toISOString(),
      reason: resolveFailureReason({
        erpnextSyncError: order.erpnextSyncError,
        erpnextInvoiceId: order.erpnextInvoiceId,
      }),
      failedAt,
      retryStatus: formatRetryStatus({
        erpnextSyncNextAutoRetryAt: order.erpnextSyncNextAutoRetryAt,
        erpnextSyncAutoRetryCount: order.erpnextSyncAutoRetryCount,
      }),
      amountIncl: amounts.amountIncl,
      shipping: amounts.shipping,
      amountExcl: amounts.amountExcl,
      currency: (order.currency || "LKR").toUpperCase(),
    };
  });

  const totalsByCurrency = groupTotalsByCurrency(rows);
  const generatedAt = new Date().toISOString();
  const cutoffLabel = `${reportDate} 23:59 Asia/Colombo`;
  const subject = buildErpSyncFailureEmailSubject({
    companyName: company.name,
    reportDate,
    orderCount: rows.length,
    isTest: options?.isTest,
  });
  const { htmlBody, plainBody } = formatErpSyncFailureEmailBodies({
    companyName: company.name,
    reportDate,
    cutoffLabel,
    generatedAt,
    orders: rows,
    totalsByCurrency,
  });

  return {
    companyId: company.id,
    companyName: company.name,
    reportDate,
    cutoffLabel,
    generatedAt,
    orderCount: rows.length,
    orders: rows,
    totalsByCurrency,
    subject,
    htmlBody,
    plainBody,
  };
}

export async function hasSuccessfulErpSyncFailureEmailSend(
  companyId: string,
  reportDate: string,
): Promise<boolean> {
  const row = await prisma.erpSyncFailureEmailSendLog.findFirst({
    where: { companyId, reportDate, status: "sent", source: "cron" },
    select: { id: true },
  });
  return Boolean(row);
}

export async function writeErpSyncFailureEmailSendLog(input: {
  companyId: string;
  reportDate: string;
  status: ErpSyncFailureEmailSendStatus;
  subject?: string | null;
  htmlBody?: string | null;
  summaryJson?: Prisma.InputJsonValue | null;
  recipients?: string[];
  errorSummary?: string | null;
  source: ErpSyncFailureEmailSource;
}): Promise<void> {
  await prisma.erpSyncFailureEmailSendLog.create({
    data: {
      companyId: input.companyId,
      reportDate: input.reportDate,
      status: input.status,
      subject: input.subject?.slice(0, 500) ?? null,
      htmlBody: input.htmlBody?.slice(0, HTML_BODY_MAX) ?? null,
      summaryJson: input.summaryJson ?? undefined,
      recipientCount: input.recipients?.length ?? 0,
      recipients: (input.recipients ?? []) as Prisma.InputJsonValue,
      errorSummary: input.errorSummary?.slice(0, 1000) ?? null,
      source: input.source,
    },
  });
}

export async function getErpSyncFailureEmailConfig(companyId: string) {
  return prisma.erpSyncFailureEmailConfig.findUnique({ where: { companyId } });
}

export async function upsertErpSyncFailureEmailConfig(input: {
  companyId: string;
  enabled: boolean;
  recipients: string[];
}) {
  return prisma.erpSyncFailureEmailConfig.upsert({
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

function snapshotSummaryJson(snapshot: ErpSyncFailureReportSnapshot): Prisma.InputJsonValue {
  return {
    orderCount: snapshot.orderCount,
    totalsByCurrency: snapshot.totalsByCurrency,
    orderIds: snapshot.orders.map((o) => o.id),
  };
}

/** Cron/manual/test orchestration for one company. Does not mutate order ERP sync fields. */
export async function runErpSyncFailureEmailForCompany(input: {
  companyId: string;
  reportDate: string;
  source: ErpSyncFailureEmailSource;
  force?: boolean;
  isTest?: boolean;
}): Promise<{
  status: ErpSyncFailureEmailSendStatus;
  snapshot?: ErpSyncFailureReportSnapshot;
  errorSummary?: string;
  recipientCount?: number;
}> {
  const config = await getErpSyncFailureEmailConfig(input.companyId);
  const enabled = config?.enabled ?? true;
  const recipients = normalizeEmailRecipientList(config?.recipients);
  const snapshot = await buildErpSyncFailureReportSnapshot(input.companyId, input.reportDate, {
    isTest: input.isTest || input.source === "preview_test",
  });
  const alreadySent = await hasSuccessfulErpSyncFailureEmailSend(
    input.companyId,
    input.reportDate,
  );
  const skip = decideErpSyncFailureEmailSkip({
    enabled,
    recipients,
    orderCount: snapshot.orderCount,
    alreadySent,
    force: input.force,
    source: input.source,
  });

  if (skip) {
    await writeErpSyncFailureEmailSendLog({
      companyId: input.companyId,
      reportDate: input.reportDate,
      status: skip,
      subject: snapshot.subject,
      summaryJson: snapshotSummaryJson(snapshot),
      recipients,
      source: input.source,
    });
    return { status: skip, snapshot, recipientCount: recipients.length };
  }

  const sendResult = await sendErpSyncFailureAlertEmail({
    toEmails: recipients,
    subject: snapshot.subject,
    html: snapshot.htmlBody,
    plain: snapshot.plainBody,
  });

  if (!sendResult.success) {
    await writeErpSyncFailureEmailSendLog({
      companyId: input.companyId,
      reportDate: input.reportDate,
      status: "failed",
      subject: snapshot.subject,
      htmlBody: snapshot.htmlBody,
      summaryJson: snapshotSummaryJson(snapshot),
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

  await writeErpSyncFailureEmailSendLog({
    companyId: input.companyId,
    reportDate: input.reportDate,
    status: "sent",
    subject: snapshot.subject,
    htmlBody: snapshot.htmlBody,
    summaryJson: snapshotSummaryJson(snapshot),
    recipients,
    source: input.source,
  });

  return { status: "sent", snapshot, recipientCount: recipients.length };
}
