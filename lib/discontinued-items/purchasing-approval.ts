/**
 * Purchasing Approval (Discontinued Items → Item Drafting): which ERP buttons apply to an item
 * and what status the clicks put it in. Pure, client-safe.
 */

import type { DiscontinuedItemPresence, DiscontinuedItemStage } from "@prisma/client";

export type DiscontinueErp = "erp1" | "erp2";

export const PRESENT_IN_LABELS: Record<DiscontinuedItemPresence, string> = {
  BOTH: "Both ERPs",
  ERP1_ONLY: "ERP 1 only",
  ERP2_ONLY: "ERP 2 only",
};

export const STAGE_LABELS: Record<DiscontinuedItemStage, string> = {
  AWAITING_APPROVAL: "Awaiting approval",
  PENDING: "Pending",
  SHOPIFY_DRAFT: "Approved · Shopify draft",
  DONE: "Approved · Done",
};

/** Months Max Sale Qty looks back over (completed months only; the current month is excluded). */
export const MAX_SALE_MONTHS = 6;

/** Where the SKU exists; null when it is in neither ERP. */
export function presenceOf(inErp1: boolean, inErp2: boolean): DiscontinuedItemPresence | null {
  if (inErp1 && inErp2) return "BOTH";
  if (inErp1) return "ERP1_ONLY";
  if (inErp2) return "ERP2_ONLY";
  return null;
}

/** ERPs whose button is clickable for this presence (the other button is shown disabled). */
export function applicableErps(presentIn: DiscontinuedItemPresence | null): DiscontinueErp[] {
  if (presentIn === "BOTH") return ["erp1", "erp2"];
  if (presentIn === "ERP1_ONLY") return ["erp1"];
  if (presentIn === "ERP2_ONLY") return ["erp2"];
  return [];
}

/**
 * Status after the clicks so far:
 * - nothing clicked → AWAITING_APPROVAL;
 * - some but not all applicable ERPs disabled → PENDING (only possible when in both);
 * - all disabled → approved: SHOPIFY_DRAFT when on ERP 1 (ERP 1 only / both), DONE when ERP 2 only.
 */
export function stageAfterClicks(
  presentIn: DiscontinuedItemPresence | null,
  disabled: { erp1: boolean; erp2: boolean },
): DiscontinuedItemStage {
  const erps = applicableErps(presentIn);
  const done = erps.filter((erp) => disabled[erp]).length;
  if (erps.length === 0 || done === 0) return "AWAITING_APPROVAL";
  if (done < erps.length) return "PENDING";
  return presentIn === "ERP2_ONLY" ? "DONE" : "SHOPIFY_DRAFT";
}

export function isApprovedStage(stage: DiscontinuedItemStage): boolean {
  return stage === "SHOPIFY_DRAFT" || stage === "DONE";
}

/** One row on the Purchasing Approval tab. Dates are ISO strings. */
export type PurchasingApprovalRow = {
  sku: string;
  productTitle: string | null;
  priorityStatus: string | null;
  maxSaleQty: number | null;
  presentIn: DiscontinuedItemPresence | null;
  erp1DisabledDate: string | null;
  erp1DisabledBy: string | null;
  erp1DryRun: boolean;
  erp2DisabledDate: string | null;
  erp2DisabledBy: string | null;
  erp2DryRun: boolean;
  disableReason: string | null;
  stage: DiscontinuedItemStage;
};

export type PurchasingApprovalData = {
  rows: PurchasingApprovalRow[];
  /** True = buttons run as a dry run: the row is saved but no ERP is changed. */
  testMode: boolean;
  /** When the ERP Items + stock were read. */
  fetchedAt: string;
};

export const PURCHASING_APPROVAL_FILTERS = ["open", "waiting", "pending", "approved", "all"] as const;
export type PurchasingApprovalFilter = (typeof PURCHASING_APPROVAL_FILTERS)[number];

export const PURCHASING_APPROVAL_FILTER_LABELS: Record<PurchasingApprovalFilter, string> = {
  open: "To approve (incl. pending)",
  waiting: "Waiting only (no ERP done)",
  pending: "Pending only",
  approved: "Approved",
  all: "All",
};

export function matchesPurchasingApprovalFilter(
  stage: DiscontinuedItemStage,
  filter: PurchasingApprovalFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "waiting") return stage === "AWAITING_APPROVAL";
  if (filter === "pending") return stage === "PENDING";
  if (filter === "approved") return isApprovedStage(stage);
  return !isApprovedStage(stage);
}
