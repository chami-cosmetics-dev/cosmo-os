import "server-only";

import type { ItemDraftingDashboardData } from "@/lib/discontinued-items/dashboard";
import { summarize } from "@/lib/discontinued-items/dashboard-summary";
import { prisma } from "@/lib/prisma";
import { loadPurchasingApproval } from "@/lib/discontinued-items/purchasing-approval.server";
import { commonSkuOf, skuKey } from "@/lib/stock-health/calc";
import { loadRopBySku } from "@/lib/stock-health/rop-status";
import { getLiveStockHealthData } from "@/lib/stock-health/weekly-summary";

/**
 * Dashboard (read-only): the Purchasing Approval items, one row per variant SKU, with Common
 * SKU, created date (ERP Item list "Created On"), current stock, OSF ROP, Max Sale Qty and which
 * ERP(s) it is in.
 */
export async function loadItemDraftingDashboard(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<ItemDraftingDashboardData> {
  // Also creates any new rows, so the dashboard and Purchasing Approval list the same items.
  const approval = await loadPurchasingApproval(companyId, { refresh: Boolean(options.refresh) });
  const [live, ropBySku, saved] = await Promise.all([
    getLiveStockHealthData(companyId),
    loadRopBySku(companyId),
    // Saved statuses for the doughnuts (Draft click, verification, active again, latest check).
    prisma.discontinuedItem.findMany({
      where: { sku: { in: approval.rows.map((row) => row.sku) } },
      select: {
        sku: true,
        stage: true,
        presentIn: true,
        erp1DisabledDate: true,
        erp2DisabledDate: true,
        draftClickedDate: true,
        verification: true,
        madeActiveAgain: true,
        draftAttempts: { orderBy: { clickedAt: "desc" }, take: 1, select: { result: true } },
      },
    }),
  ]);
  const itemBySku = new Map(live.items.map((item) => [skuKey(item.sku), item]));

  // Exactly the Purchasing Approval rows, so Waiting / Pending always match that tab.
  const summary = summarize(
    saved.map((s) => ({
      stage: s.stage,
      presentIn: s.presentIn,
      erp1Done: Boolean(s.erp1DisabledDate),
      erp2Done: Boolean(s.erp2DisabledDate),
      draftClicked: Boolean(s.draftClickedDate),
      verification: s.verification,
      madeActiveAgain: s.madeActiveAgain,
      checkFailed: Boolean(s.draftClickedDate) && s.draftAttempts[0]?.result === "CHECK_FAILED",
    })),
  );

  return {
    summary,
    rows: approval.rows.map((row) => {
      const key = skuKey(row.sku);
      const item = itemBySku.get(key);
      return {
        sku: row.sku,
        commonSku: commonSkuOf(
          item ?? { sku: row.sku, brand: null, priority: null, siteStatus: null, itemName: null },
        ),
        productTitle: row.productTitle,
        priorityStatus: row.priorityStatus,
        createdDate: item?.createdOn ?? null,
        createdBy: item?.createdBy ?? null,
        currentStock: live.stockBySku.get(key) ?? 0,
        rop: ropBySku.get(key) ?? null,
        maxSaleQty: row.maxSaleQty,
        inErp1: item ? Boolean(item.inErp1) : row.presentIn !== "ERP2_ONLY",
        inErp2: item ? Boolean(item.inErp2) : row.presentIn !== "ERP1_ONLY",
      };
    }),
    fetchedAt: approval.fetchedAt,
  };
}
