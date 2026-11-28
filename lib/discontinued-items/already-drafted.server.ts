import "server-only";

import { ALREADY_DRAFTED_BY } from "@/lib/discontinued-items/already-drafted";
import { verdictOfShopifyStatus } from "@/lib/discontinued-items/verification";
import {
  fetchProductStatuses,
  handlesBySku,
  shopifyStoreHandle,
} from "@/lib/discontinued-items/verification.server";
import { prisma } from "@/lib/prisma";
import { skuKey } from "@/lib/stock-health/calc";

export type AlreadyDraftedRunResult = {
  checked: number;
  completed: number;
  /** Shopify could not be read: the items stay unchecked and are retried on the next run. */
  error: string | null;
};

/**
 * Once per approved item (stage Shopify Draft, no Draft click yet): reads Shopify (read-only).
 * A product that is already Draft is completed by the system — Drafted by "Already drafted in
 * Shopify", Drafted date = the Purchasing approval date, no Search Console figures — and leaves
 * the Shopify Draft list (Completed; checked weekly for Active Again like any drafted item).
 * Any other result only stamps the check; the item stays for SEO. Never checked again after
 * that (items drafted by hand later still need the Draft click).
 */
export async function completeAlreadyDraftedItems(
  options: { skus?: string[]; now?: Date } = {},
): Promise<AlreadyDraftedRunResult> {
  const result: AlreadyDraftedRunResult = { checked: 0, completed: 0, error: null };
  const items = await prisma.discontinuedItem.findMany({
    where: {
      stage: "SHOPIFY_DRAFT",
      draftClickedDate: null,
      alreadyDraftCheckedAt: null,
      draftAttempts: { none: {} },
      ...(options.skus ? { sku: { in: options.skus } } : {}),
    },
    select: { id: true, sku: true, approvedDate: true },
  });
  if (items.length === 0) return result;

  const storeHandle = await shopifyStoreHandle();
  if (!storeHandle) {
    result.error = "No Shopify store is set on the company locations.";
    return result;
  }
  const handles = await handlesBySku(items.map((item) => item.sku));
  const wanted = [...new Set(items.map((item) => handles.get(skuKey(item.sku))).filter((h): h is string => !!h))];
  let statuses = new Map<string, string>();
  if (wanted.length > 0) {
    try {
      statuses = await fetchProductStatuses(storeHandle, wanted);
    } catch (error) {
      result.error = error instanceof Error ? error.message : "Shopify lookup failed";
      console.error("[Discontinued Items] Already-drafted Shopify lookup failed:", error);
      return result;
    }
  }

  const now = options.now ?? new Date();
  const notDraft: string[] = [];
  for (const item of items) {
    result.checked += 1;
    const handle = handles.get(skuKey(item.sku)) ?? null;
    const status = handle ? statuses.get(handle) : undefined;
    if (verdictOfShopifyStatus(status) !== "PASS") {
      notDraft.push(item.id);
      continue;
    }
    const draftedDate = item.approvedDate ?? now;
    const done = await prisma.$transaction(async (tx) => {
      // Conditional, so a Draft click or another run at the same moment cannot double up.
      const claim = await tx.discontinuedItem.updateMany({
        where: { id: item.id, stage: "SHOPIFY_DRAFT", draftClickedDate: null, alreadyDraftCheckedAt: null },
        data: {
          alreadyDraftCheckedAt: now,
          stage: "DONE",
          doneDate: now,
          draftClickedDate: draftedDate,
          draftClickedBy: ALREADY_DRAFTED_BY,
          verification: "PASS",
          verifiedAt: now,
          impressions: null,
          clicks: null,
          ctr: null,
          avgPosition: null,
        },
      });
      if (claim.count === 0) return false;
      // Kept on the Draft Attempts history sheet like a verified Draft click.
      await tx.discontinuedItemDraftAttempt.create({
        data: {
          itemId: item.id,
          clickedAt: draftedDate,
          clickedBy: ALREADY_DRAFTED_BY,
          result: "PASS",
          shopifyStatus: status ?? null,
          handle,
          checkedAt: now,
          checkCount: 1,
        },
      });
      return true;
    });
    if (done) result.completed += 1;
  }
  if (notDraft.length > 0) {
    await prisma.discontinuedItem.updateMany({
      where: { id: { in: notDraft }, alreadyDraftCheckedAt: null },
      data: { alreadyDraftCheckedAt: now },
    });
  }
  return result;
}

/** Same, but never throws (used inside page loads and button clicks). */
export async function completeAlreadyDraftedItemsSafely(options: { skus?: string[] } = {}): Promise<void> {
  try {
    await completeAlreadyDraftedItems(options);
  } catch (error) {
    console.error("[Discontinued Items] Already-drafted check failed:", error);
  }
}
