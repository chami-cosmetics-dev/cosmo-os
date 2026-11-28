/**
 * Item Drafting → Dashboard doughnuts. Every item lands in exactly one segment per doughnut, from
 * its saved status; the doughnuts chain: Shopify Draft = Purchasing "Approved", After Drafting =
 * Shopify Draft "Completed" + "Already drafted in Shopify". Pure, client-safe.
 */

import type { DiscontinuedItemPresence, DiscontinuedItemStage } from "@prisma/client";

export type SummaryInput = {
  stage: DiscontinuedItemStage;
  presentIn: DiscontinuedItemPresence | null;
  erp1Done: boolean;
  erp2Done: boolean;
  draftClicked: boolean;
  verification: "PASS" | "FAIL" | null;
  madeActiveAgain: boolean;
  /** The current Draft click's Shopify check could not be done (Phase 5). */
  checkFailed: boolean;
  /** Completed by the system: Shopify already showed Draft at approval ("Already drafted in Shopify"). */
  alreadyDrafted?: boolean;
};

export type PurchasingSegment = "waiting" | "pending" | "approved" | "notOnWebsite";
export type ShopifySegment = "awaitingDraft" | "alreadyDraft" | "awaitingCheck" | "mismatch" | "completed";

/** Shopify Draft groups a Dashboard click can open (Draft column filter). */
export type ShopifyDraftGroup = "awaitingDraft" | "awaitingCheck" | "mismatch";
export type AfterSegment = "stillDrafted" | "activeAgain";

export type ItemSegments = {
  purchasing: PurchasingSegment;
  shopify: ShopifySegment | null;
  after: AfterSegment | null;
};

export function segmentsOf(item: SummaryInput): ItemSegments {
  let purchasing: PurchasingSegment;
  if (item.stage === "AWAITING_APPROVAL") purchasing = "waiting";
  else if (item.stage === "PENDING") purchasing = "pending";
  else if (item.stage === "DONE" && item.presentIn === "ERP2_ONLY") purchasing = "notOnWebsite";
  else purchasing = "approved"; // SHOPIFY_DRAFT, or DONE on the website (verified drafted)

  let shopify: ShopifySegment | null = null;
  if (purchasing === "approved") {
    // Already Draft in Shopify at approval: completed by the system, never in the Shopify Draft tab.
    if (item.stage === "DONE") shopify = item.alreadyDrafted ? "alreadyDraft" : "completed";
    else if (item.draftClicked) shopify = "awaitingCheck";
    else shopify = item.verification === "FAIL" ? "mismatch" : "awaitingDraft";
  }

  // Both kinds of drafted items are checked weekly for Active Again.
  const after: AfterSegment | null =
    shopify === "completed" || shopify === "alreadyDraft"
      ? item.madeActiveAgain
        ? "activeAgain"
        : "stillDrafted"
      : null;
  return { purchasing, shopify, after };
}

export type ItemDraftingSummary = {
  total: number;
  purchasing: Record<PurchasingSegment, number>;
  /** Pending split: which ERP is still to disable. */
  pendingErp1Left: number;
  pendingErp2Left: number;
  shopify: Record<ShopifySegment, number>;
  /** Of Awaiting Check: the check could not be done (retried). */
  checkFailed: number;
  after: Record<AfterSegment, number>;
};

export function summarize(items: SummaryInput[]): ItemDraftingSummary {
  const summary: ItemDraftingSummary = {
    total: items.length,
    purchasing: { waiting: 0, pending: 0, approved: 0, notOnWebsite: 0 },
    pendingErp1Left: 0,
    pendingErp2Left: 0,
    shopify: { awaitingDraft: 0, alreadyDraft: 0, awaitingCheck: 0, mismatch: 0, completed: 0 },
    checkFailed: 0,
    after: { stillDrafted: 0, activeAgain: 0 },
  };
  for (const item of items) {
    const s = segmentsOf(item);
    summary.purchasing[s.purchasing] += 1;
    if (s.purchasing === "pending") {
      if (!item.erp1Done) summary.pendingErp1Left += 1;
      else summary.pendingErp2Left += 1;
    }
    if (s.shopify) {
      summary.shopify[s.shopify] += 1;
      if (s.shopify === "awaitingCheck" && item.checkFailed) summary.checkFailed += 1;
    }
    if (s.after) summary.after[s.after] += 1;
  }
  return summary;
}
