/** Item Drafting → Dashboard (read-only). Client-safe types. */

import type { ItemDraftingSummary } from "@/lib/discontinued-items/dashboard-summary";

export type ItemDraftingDashboardRow = {
  sku: string;
  commonSku: string;
  productTitle: string | null;
  /** Resolved Product Priority (ERP 1, else ERP 2). */
  priorityStatus: string | null;
  /** ERP Item list "Created On", "YYYY-MM-DD" (the earlier one when in both ERPs). */
  createdDate: string | null;
  /** ERP Item list "Created By" for that Created On: an ERP user, or "Guest". */
  createdBy: string | null;
  /** Every warehouse, every ERP. */
  currentStock: number;
  /** OSF ROP over the ROP columns; null when none is set. */
  rop: number | null;
  maxSaleQty: number | null;
  /** The SKU is on ERP 1's / ERP 2's Item list (the "Present in" columns). */
  inErp1: boolean;
  inErp2: boolean;
};

/** ERPNext's "Created By" for items made without a logged-in user (e.g. by an integration). */
export function isGuestCreated(createdBy: string | null): boolean {
  return (createdBy ?? "").trim().toLowerCase() === "guest";
}

export type ItemDraftingDashboardData = {
  rows: ItemDraftingDashboardRow[];
  /** Doughnut / count-card numbers (same items as Purchasing Approval, saved statuses). */
  summary: ItemDraftingSummary;
  /** When the ERP Items + stock were read. */
  fetchedAt: string;
};
