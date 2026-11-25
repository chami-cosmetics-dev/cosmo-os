import "server-only";

import type { Prisma } from "@prisma/client";

import {
  ACTIVE_AGAIN_SETTING_KEY,
  activeAgainPlaceholders,
  isWeeklyRunDue,
  parseActiveAgainSchedule,
  weeklySlot,
  type ActiveAgainMailRow,
  type ActiveAgainSchedule,
} from "@/lib/discontinued-items/active-again";
import { ACTIVE_AGAIN_MAIL_TEMPLATE } from "@/lib/discontinued-items/active-again-mail-template";
import {
  clearActiveAgainMailFailed,
  notifyActiveAgainMailFailed,
} from "@/lib/discontinued-items/notifications";
import { clearTestDataIfLive } from "@/lib/discontinued-items/purchasing-approval.server";
import {
  fetchProductStatuses,
  handlesBySku,
  shopifyStoreHandle,
} from "@/lib/discontinued-items/verification.server";
import { parseEmailAddressList, renderEmailTemplatePlaceholders } from "@/lib/email-templates/render";
import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { sendStockHealthSummaryEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { skuKey } from "@/lib/stock-health/calc";
import { getLiveStockHealthData } from "@/lib/stock-health/weekly-summary";

type StoredSetting = ActiveAgainSchedule & { lastRunWeek: string | null };

export async function getActiveAgainSetting(): Promise<StoredSetting & { updatedBy: string | null; updatedAt: string | null }> {
  const row = await prisma.discontinuedItemSetting.findUnique({ where: { key: ACTIVE_AGAIN_SETTING_KEY } });
  const value = (row?.value ?? {}) as { lastRunWeek?: unknown };
  return {
    ...parseActiveAgainSchedule(row?.value),
    lastRunWeek: typeof value.lastRunWeek === "string" ? value.lastRunWeek : null,
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

async function writeSetting(value: StoredSetting, updatedBy?: string) {
  const json = value as unknown as Prisma.InputJsonValue;
  await prisma.discontinuedItemSetting.upsert({
    where: { key: ACTIVE_AGAIN_SETTING_KEY },
    create: { key: ACTIVE_AGAIN_SETTING_KEY, value: json, updatedBy: updatedBy ?? null },
    update: { value: json, ...(updatedBy ? { updatedBy } : {}) },
  });
}

/** Saves the day / time (the week's run marker is kept, so a change never runs a week twice). */
export async function saveActiveAgainSchedule(schedule: ActiveAgainSchedule, updatedBy: string) {
  const current = await getActiveAgainSetting();
  await writeSetting({ ...parseActiveAgainSchedule(schedule), lastRunWeek: current.lastRunWeek }, updatedBy);
  return getActiveAgainSetting();
}

/** The company whose Email Template / ERP data is used: the one owning the Shopify store location. */
async function mailCompanyId(): Promise<string | null> {
  const store = await shopifyStoreHandle();
  if (store) {
    const location = await prisma.companyLocation.findFirst({
      where: { shopifyAdminStoreHandle: { contains: store, mode: "insensitive" } },
      select: { companyId: true },
    });
    if (location) return location.companyId;
  }
  const company = await prisma.company.findFirst({
    where: { erpnextInstances: { some: {} } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return company?.id ?? null;
}

/**
 * READ-ONLY detection: done items (drafted + verified pass) whose Shopify product is Active again
 * → made_active_again = yes, active_date = now. Items already flagged are never checked again.
 * Throws when Shopify cannot be read (nothing is flagged; the run is retried).
 */
export async function detectActiveAgain(now: Date = new Date()): Promise<number> {
  const items = await prisma.discontinuedItem.findMany({
    where: { stage: "DONE", verification: "PASS", madeActiveAgain: false },
    select: { id: true, sku: true },
  });
  if (items.length === 0) return 0;
  const store = await shopifyStoreHandle();
  if (!store) throw new Error("No Shopify store is set on the company locations.");
  const handles = await handlesBySku(items.map((i) => i.sku));
  const statuses = await fetchProductStatuses(store, [...new Set(handles.values())]);

  const activeIds = items
    .filter((item) => {
      const handle = handles.get(skuKey(item.sku));
      return handle != null && statuses.get(handle)?.toUpperCase() === "ACTIVE";
    })
    .map((item) => item.id);
  if (activeIds.length === 0) return 0;
  const flagged = await prisma.discontinuedItem.updateMany({
    where: { id: { in: activeIds }, madeActiveAgain: false },
    data: { madeActiveAgain: true, activeDate: now },
  });
  return flagged.count;
}

async function loadTemplate(companyId: string) {
  const [stored, company] = await Promise.all([
    prisma.emailTemplate.findUnique({
      where: { companyId_key: { companyId, key: ACTIVE_AGAIN_MAIL_TEMPLATE.key } },
      select: { subject: true, bodyHtml: true, recipients: true, ccRecipients: true },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  const to = parseEmailAddressList(stored?.recipients);
  const cc = parseEmailAddressList(stored?.ccRecipients).filter((email) => !to.includes(email));
  return {
    subject: stored?.subject || ACTIVE_AGAIN_MAIL_TEMPLATE.subject,
    bodyHtml: stored?.bodyHtml || ACTIVE_AGAIN_MAIL_TEMPLATE.bodyHtml,
    to,
    cc,
    companyName: company?.name ?? "",
  };
}

/** Mail rows: saved figures + the current ERP Product Priority (from the live item list). */
async function mailRows(companyId: string, ids: string[]): Promise<ActiveAgainMailRow[]> {
  const [items, live] = await Promise.all([
    prisma.discontinuedItem.findMany({ where: { id: { in: ids } }, orderBy: { sku: "asc" } }),
    getLiveStockHealthData(companyId),
  ]);
  const priorityBySku = new Map(live.items.map((i) => [skuKey(i.sku), i.priority]));
  return items.map((item) => ({
    sku: item.sku,
    itemName: item.productTitle,
    maxSale: item.maxSaleQty,
    impressions: item.impressions,
    clicks: item.clicks,
    ctr: item.ctr != null ? Number(item.ctr) : null,
    avgPosition: item.avgPosition != null ? Number(item.avgPosition) : null,
    reason: item.disableReason,
    draftedDate: item.draftClickedDate ? formatAppIsoDate(item.draftClickedDate) : null,
    currentPriority: priorityBySku.has(skuKey(item.sku)) ? (priorityBySku.get(skuKey(item.sku)) ?? "Blank") : null,
  }));
}

function render(template: Awaited<ReturnType<typeof loadTemplate>>, rows: ActiveAgainMailRow[], now: Date) {
  const placeholders = activeAgainPlaceholders(rows, {
    companyName: template.companyName,
    generatedAt: formatAppDateTime(now),
    reportDate: formatAppIsoDate(now),
  });
  const subject = renderEmailTemplatePlaceholders(template.subject, placeholders);
  const html = renderEmailTemplatePlaceholders(template.bodyHtml, placeholders);
  return { subject, html, placeholders };
}

export type ActiveAgainSendResult =
  | { status: "nothing_to_send" }
  | { status: "sent"; count: number }
  | { status: "failed" | "no_recipients"; count: number; error: string };

/**
 * Mails every item flagged active again and not mailed yet (none → nothing is sent). Items are
 * stamped as mailed only after a successful send, so a failed send is retried at the next run.
 */
export async function sendPendingActiveAgainMail(now: Date = new Date()): Promise<ActiveAgainSendResult> {
  const pending = await prisma.discontinuedItem.findMany({
    where: { madeActiveAgain: true, activeAgainNotifiedAt: null },
    select: { id: true },
  });
  if (pending.length === 0) return { status: "nothing_to_send" };
  const count = pending.length;
  const companyId = await mailCompanyId();
  if (!companyId) {
    const error = "No company found for the mail.";
    await notifyActiveAgainMailFailed(error, count, now);
    return { status: "failed", count, error };
  }

  const template = await loadTemplate(companyId);
  if (template.to.length === 0) {
    const error = `Email Template "${ACTIVE_AGAIN_MAIL_TEMPLATE.name}" has no To recipients (Settings → Email Templates).`;
    console.warn(`[active-again-mail] ${error}`);
    await notifyActiveAgainMailFailed(error, count, now);
    return { status: "no_recipients", count, error };
  }

  const ids = pending.map((p) => p.id);
  const { subject, html } = render(template, await mailRows(companyId, ids), now);
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const send = await sendStockHealthSummaryEmail({ toEmails: template.to, ccEmails: template.cc, subject, html, plain });
  if (!send.success) {
    const error = send.message ?? "Send failed";
    console.error("[active-again-mail] send failed:", error);
    await notifyActiveAgainMailFailed(`Sending failed: ${error}.`, count, now);
    return { status: "failed", count, error };
  }
  await prisma.discontinuedItem.updateMany({
    where: { id: { in: ids }, activeAgainNotifiedAt: null },
    data: { activeAgainNotifiedAt: now },
  });
  await clearActiveAgainMailFailed();
  return { status: "sent", count };
}

/**
 * The cron (every 30 minutes): once the week's configured day / time has passed, runs the
 * read-only detection once that week; then sends any flagged items not mailed yet (also the
 * retry of a failed send).
 */
export async function runScheduledActiveAgain(now: Date = new Date()) {
  await clearTestDataIfLive();
  const setting = await getActiveAgainSetting();
  let detected: number | null = null;
  let detectError: string | null = null;
  if (isWeeklyRunDue(now, setting, setting.lastRunWeek)) {
    try {
      detected = await detectActiveAgain(now);
      await writeSetting({ weekday: setting.weekday, time: setting.time, lastRunWeek: weeklySlot(now, setting).weekKey });
    } catch (error) {
      // Not marked as run: retried at the next tick.
      detectError = error instanceof Error ? error.message : "Detection failed";
      console.error("[active-again] detection failed:", error);
    }
  }
  const mail = await sendPendingActiveAgainMail(now);
  return { detected, detectError, mail };
}

/**
 * Settings → Email Templates "Send test mail": items waiting to be mailed, else the latest ones
 * flagged, else one sample row — nothing is stamped as mailed.
 */
export async function loadActiveAgainTestPlaceholders(
  companyId: string,
  key: string,
): Promise<Record<string, string> | null> {
  if (key !== ACTIVE_AGAIN_MAIL_TEMPLATE.key) return null;
  const now = new Date();
  const flagged = await prisma.discontinuedItem.findMany({
    where: { madeActiveAgain: true },
    orderBy: [{ activeAgainNotifiedAt: { sort: "asc", nulls: "first" } }, { activeDate: "desc" }],
    take: 20,
    select: { id: true },
  });
  const template = await loadTemplate(companyId);
  const rows: ActiveAgainMailRow[] = flagged.length
    ? await mailRows(companyId, flagged.map((f) => f.id))
    : [
        {
          sku: "SAMPLE_1",
          itemName: "Sample item (no item has become active again yet)",
          maxSale: 4,
          impressions: 3698,
          clicks: 55,
          ctr: 0.0149,
          avgPosition: 5.39,
          reason: "Supplier discontinued",
          draftedDate: formatAppIsoDate(now),
          currentPriority: "Top",
        },
      ];
  return render(template, rows, now).placeholders;
}
