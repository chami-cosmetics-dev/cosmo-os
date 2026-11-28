import "server-only";

import { Prisma } from "@prisma/client";

import { createNotification } from "@/lib/approval-workflow";
import {
  clearTestDataIfLive,
  isDiscontinueTestMode,
} from "@/lib/discontinued-items/purchasing-approval.server";
import { prisma } from "@/lib/prisma";
import { reminderPermissionForCategory } from "@/lib/reminder-permissions";

export const ITEM_DRAFTING_HREF = "/dashboard/discontinued-items/item-drafting";

/** Bell notification types (the bell links both to Item Drafting). */
export const DISCONTINUED_NOTIFICATION_TYPES = {
  pending: "discontinued_pending",
  shopifyDraft: "discontinued_shopify_draft",
  checkFailed: "discontinued_check_failed",
  activeAgainMailFailed: "discontinued_active_again_mail_failed",
} as const;

/** Pending reminder repeats at most this often while pending items remain. */
const PENDING_REMIND_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_STATE_KEY = "pending";

/**
 * Rows behind each bubble / notification, from the saved Purchasing Approval status:
 * - pending: in both ERPs, only one disabled;
 * - Shopify draft: approved for drafting and not drafted yet. SHOPIFY_DRAFT is only ever set for
 *   ERP 1 only / both, so ERP 2 only items never count.
 */
export function discontinuedReminderWhere(
  category: "discontinued_pending" | "discontinued_shopify_draft",
): Prisma.DiscontinuedItemWhereInput {
  return category === "discontinued_pending"
    ? { stage: "PENDING" }
    : { stage: "SHOPIFY_DRAFT", draftClickedDate: null };
}

export async function countDiscontinuedReminders(): Promise<{ pending: number; shopifyDraft: number }> {
  await clearTestDataIfLive();
  const [pending, shopifyDraft] = await Promise.all([
    prisma.discontinuedItem.count({ where: discontinuedReminderWhere("discontinued_pending") }),
    prisma.discontinuedItem.count({ where: discontinuedReminderWhere("discontinued_shopify_draft") }),
  ]);
  return { pending, shopifyDraft };
}

/** Users whose role has any of these permissions ticked. */
async function usersWithPermissions(keys: string[]) {
  const users = await prisma.user.findMany({
    where: {
      companyId: { not: null },
      userRoles: { some: { role: { rolePermissions: { some: { permission: { key: { in: keys } } } } } } },
    },
    select: { id: true, companyId: true },
  });
  return users.filter((u): u is { id: string; companyId: string } => Boolean(u.companyId));
}

/** Users whose role has this bubble's reminders.* permission ticked (same grant shows the bubble). */
function recipientsFor(category: "discontinued_pending" | "discontinued_shopify_draft") {
  return usersWithPermissions([reminderPermissionForCategory(category)]);
}

async function notifyUsers(
  users: Array<{ id: string; companyId: string }>,
  type: string,
  title: string,
  body: string,
): Promise<number> {
  const prefix = isDiscontinueTestMode() ? "[Test] " : "";
  for (const user of users) {
    await createNotification({
      companyId: user.companyId,
      userId: user.id,
      type,
      title: `${prefix}${title}`,
      body,
      entityType: "DiscontinuedItem",
    });
  }
  return users.length;
}

async function sendToAll(
  category: "discontinued_pending" | "discontinued_shopify_draft",
  title: string,
  body: string,
): Promise<number> {
  return notifyUsers(await recipientsFor(category), category, title, body);
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Purchasing (Inoka): "N items are pending in Purchasing Approval". Sent as soon as items become
 * pending, then again only after 7 days while any remain (never daily). At 0 the record is
 * removed, so the next pending item notifies straight away. Safe to call often (button clicks,
 * the hourly cron): the state row is claimed before sending, so it cannot go twice.
 */
export async function notifyPendingIfDue(now: Date = new Date()): Promise<{ sent: boolean; count: number }> {
  const { pending: count } = await countDiscontinuedReminders();
  if (count === 0) {
    await prisma.discontinuedItemReminderState.deleteMany({ where: { key: PENDING_STATE_KEY } });
    return { sent: false, count };
  }

  const state = await prisma.discontinuedItemReminderState.findUnique({ where: { key: PENDING_STATE_KEY } });
  if (state) {
    if (now.getTime() - state.lastSentAt.getTime() < PENDING_REMIND_EVERY_MS) return { sent: false, count };
    const claim = await prisma.discontinuedItemReminderState.updateMany({
      where: { key: PENDING_STATE_KEY, lastSentAt: state.lastSentAt },
      data: { lastSentAt: now, lastCount: count },
    });
    if (claim.count === 0) return { sent: false, count };
  } else {
    try {
      await prisma.discontinuedItemReminderState.create({
        data: { key: PENDING_STATE_KEY, lastSentAt: now, lastCount: count },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return { sent: false, count };
      throw error;
    }
  }

  await sendToAll(
    "discontinued_pending",
    `${count} item${count === 1 ? " is" : "s are"} pending in Purchasing Approval`,
    "Disabled in one ERP only. Open Discontinued Items → Item Drafting → Purchasing Approval to finish them.",
  );
  return { sent: true, count };
}

/**
 * SEO (Nipun): "N items are approved for drafting on Shopify". Sent only when items were newly
 * approved since the last one (each item is stamped seoNotifiedAt once); N = every approved item
 * not drafted yet. The stamp is claimed before sending, so overlapping runs cannot both send.
 */
export async function notifyShopifyDraftIfNew(now: Date = new Date()): Promise<{ sent: boolean; count: number }> {
  const fresh = await prisma.discontinuedItem.findMany({
    where: { ...discontinuedReminderWhere("discontinued_shopify_draft"), seoNotifiedAt: null },
    select: { id: true },
  });
  if (fresh.length === 0) return { sent: false, count: 0 };

  const claim = await prisma.discontinuedItem.updateMany({
    where: { id: { in: fresh.map((row) => row.id) }, seoNotifiedAt: null },
    data: { seoNotifiedAt: now },
  });
  if (claim.count === 0) return { sent: false, count: 0 };

  const { shopifyDraft: count } = await countDiscontinuedReminders();
  if (count === 0) return { sent: false, count };
  await sendToAll(
    "discontinued_shopify_draft",
    `${count} item${count === 1 ? " is" : "s are"} approved for drafting on Shopify`,
    "Open Discontinued Items → Item Drafting → Shopify Draft.",
  );
  return { sent: true, count };
}

const MISMATCH_STATE_KEY = "mismatch";

/** Items whose latest Draft click failed the Shopify check (still Active / Archived) and not re-drafted. */
export const MISMATCH_WHERE: Prisma.DiscontinuedItemWhereInput = {
  stage: "SHOPIFY_DRAFT",
  draftClickedDate: null,
  verification: "FAIL",
};

/**
 * SEO (Nipun): "N items were marked as drafted but are still active in Shopify". Sent once when
 * mismatches appear, then weekly while any remain; at 0 the record is removed (same rules and
 * recipients as the Shopify Draft bubble).
 */
export async function notifyMismatchIfDue(now: Date = new Date()): Promise<{ sent: boolean; count: number }> {
  const count = await prisma.discontinuedItem.count({ where: MISMATCH_WHERE });
  if (count === 0) {
    await prisma.discontinuedItemReminderState.deleteMany({ where: { key: MISMATCH_STATE_KEY } });
    return { sent: false, count };
  }
  const state = await prisma.discontinuedItemReminderState.findUnique({ where: { key: MISMATCH_STATE_KEY } });
  if (state) {
    if (now.getTime() - state.lastSentAt.getTime() < PENDING_REMIND_EVERY_MS) return { sent: false, count };
    const claim = await prisma.discontinuedItemReminderState.updateMany({
      where: { key: MISMATCH_STATE_KEY, lastSentAt: state.lastSentAt },
      data: { lastSentAt: now, lastCount: count },
    });
    if (claim.count === 0) return { sent: false, count };
  } else {
    try {
      await prisma.discontinuedItemReminderState.create({
        data: { key: MISMATCH_STATE_KEY, lastSentAt: now, lastCount: count },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return { sent: false, count };
      throw error;
    }
  }
  await sendToAll(
    "discontinued_shopify_draft",
    `${count} item${count === 1 ? " was" : "s were"} marked as drafted but ${count === 1 ? "is" : "are"} still active in Shopify`,
    "Open Discontinued Items → Item Drafting → Shopify Draft: rows marked Mismatch can be drafted again.",
  );
  return { sent: true, count };
}

/**
 * "Check failed" (handle not found, product missing, Shopify error): one notification per Draft
 * attempt to everyone with Shopify Draft or Item Drafting manager access. Each attempt is claimed
 * before sending, so it goes once even while the check keeps being retried.
 */
export async function notifyCheckFailed(now: Date = new Date()): Promise<number> {
  const attempts = await prisma.discontinuedItemDraftAttempt.findMany({
    where: { result: "CHECK_FAILED", checkFailedNotifiedAt: null },
    select: { id: true, lastError: true, item: { select: { sku: true } } },
  });
  if (attempts.length === 0) return 0;
  const claim = await prisma.discontinuedItemDraftAttempt.updateMany({
    where: { id: { in: attempts.map((a) => a.id) }, checkFailedNotifiedAt: null },
    data: { checkFailedNotifiedAt: now },
  });
  if (claim.count === 0) return 0;

  const users = await usersWithPermissions([
    "discontinued_items.shopify_draft.read",
    "discontinued_items.manager",
  ]);
  const skus = attempts.map((a) => a.item.sku);
  const shown = skus.slice(0, 5).join(", ") + (skus.length > 5 ? ` and ${skus.length - 5} more` : "");
  await notifyUsers(
    users,
    DISCONTINUED_NOTIFICATION_TYPES.checkFailed,
    `${skus.length} drafted item${skus.length === 1 ? "" : "s"} could not be checked in Shopify`,
    `${shown}. ${attempts[0]?.lastError ?? ""} They are retried at the next 5:30 PM check; open Shopify Draft to re-check now.`.trim(),
  );
  return attempts.length;
}

const ACTIVE_AGAIN_FAILED_STATE_KEY = "active_again_mail_failed";

/**
 * The weekly "active again" mail could not be sent: one notification to Item Drafting managers
 * until it is sent (the state is cleared on success, so a later failure notifies again).
 */
export async function notifyActiveAgainMailFailed(reason: string, count: number, now: Date = new Date()) {
  try {
    await prisma.discontinuedItemReminderState.create({
      data: { key: ACTIVE_AGAIN_FAILED_STATE_KEY, lastSentAt: now, lastCount: count },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
  await notifyUsers(
    await usersWithPermissions(["discontinued_items.manager"]),
    DISCONTINUED_NOTIFICATION_TYPES.activeAgainMailFailed,
    `"Active again" mail not sent (${count} item${count === 1 ? "" : "s"})`,
    `${reason} It is retried every 30 minutes; the items are kept until the mail goes out.`,
  );
  return true;
}

export async function clearActiveAgainMailFailed() {
  await prisma.discontinuedItemReminderState.deleteMany({ where: { key: ACTIVE_AGAIN_FAILED_STATE_KEY } });
}
