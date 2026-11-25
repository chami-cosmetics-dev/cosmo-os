import "server-only";

import type { DiscontinuedItem, Prisma } from "@prisma/client";

import {
  applicableErps,
  MAX_SALE_MONTHS,
  presenceOf,
  stageAfterClicks,
  type DiscontinueErp,
  type PurchasingApprovalData,
  type PurchasingApprovalRow,
} from "@/lib/discontinued-items/purchasing-approval";
import { maxSaleQtyInWindow, unitsByMonth } from "@/lib/newly-added-review/calc";
import { getAllOsfErpInstances, OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import { addMonths } from "@/lib/sales-budget/budget-month";
import { getSalesBudgetSalesData } from "@/lib/sales-budget/sales-data";
import { isZeroStock, skuKey, stockHealthStatusOf } from "@/lib/stock-health/calc";
import { getLiveStockHealthData } from "@/lib/stock-health/weekly-summary";

/**
 * Test mode (dry run) is ON unless DISCONTINUED_ITEMS_ERP_LIVE is exactly "true". In test mode a
 * button click is saved (marked as a dry run) but no ERP is called.
 */
export function isDiscontinueTestMode(): boolean {
  return process.env.DISCONTINUED_ITEMS_ERP_LIVE?.trim().toLowerCase() !== "true";
}

export class PurchasingApprovalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PurchasingApprovalError";
  }
}

const REMARK_MAX = 500;

function toRow(item: DiscontinuedItem): PurchasingApprovalRow {
  return {
    sku: item.sku,
    productTitle: item.productTitle,
    priorityStatus: item.priorityStatus,
    maxSaleQty: item.maxSaleQty,
    presentIn: item.presentIn,
    erp1DisabledDate: item.erp1DisabledDate?.toISOString() ?? null,
    erp1DisabledBy: item.erp1DisabledBy,
    erp1DryRun: item.erp1DryRun,
    erp2DisabledDate: item.erp2DisabledDate?.toISOString() ?? null,
    erp2DisabledBy: item.erp2DisabledBy,
    erp2DryRun: item.erp2DryRun,
    disableReason: item.disableReason,
    stage: item.stage,
  };
}

function hasAnyClick(item: Pick<DiscontinuedItem, "erp1DisabledDate" | "erp2DisabledDate">) {
  return Boolean(item.erp1DisabledDate || item.erp2DisabledDate);
}

/**
 * Removes test data (clicks made in test mode). Runs once live mode is on (see
 * `clearTestDataIfLive`) and from the "Reset test clicks" button in test mode.
 * - A row whose ERP clicks were all test clicks is DELETED, with its Draft click history
 *   (cascade). If the SKU still qualifies, the next load re-creates it fresh from ERP, so no
 *   test Disable / approval / Draft click / Shopify check / Search Console figures / active-again
 *   values are left anywhere (screens, reminders, Download history).
 * - A row that also has a real (live) ERP click keeps that click; only the test side is undone.
 */
export async function clearDryRunClicks(): Promise<number> {
  const rows = await prisma.discontinuedItem.findMany({
    where: { OR: [{ erp1DryRun: true }, { erp2DryRun: true }] },
  });
  const testOnly = rows.filter(
    (row) => (!row.erp1DisabledDate || row.erp1DryRun) && (!row.erp2DisabledDate || row.erp2DryRun),
  );
  if (testOnly.length > 0) {
    await prisma.discontinuedItem.deleteMany({
      where: { id: { in: testOnly.map((row) => row.id) }, OR: [{ erp1DryRun: true }, { erp2DryRun: true }] },
    });
  }
  const testOnlyIds = new Set(testOnly.map((row) => row.id));
  for (const row of rows.filter((r) => !testOnlyIds.has(r.id))) {
    const erp1 = row.erp1DryRun ? null : row.erp1DisabledDate;
    const erp2 = row.erp2DryRun ? null : row.erp2DisabledDate;
    const stage = stageAfterClicks(row.presentIn, { erp1: Boolean(erp1), erp2: Boolean(erp2) });
    await prisma.discontinuedItem.update({
      where: { id: row.id },
      data: {
        ...(row.erp1DryRun ? { erp1DisabledDate: null, erp1DisabledBy: null, erp1DryRun: false } : {}),
        ...(row.erp2DryRun ? { erp2DisabledDate: null, erp2DisabledBy: null, erp2DryRun: false } : {}),
        stage,
        approvedDate: stage === "SHOPIFY_DRAFT" || stage === "DONE" ? row.approvedDate : null,
        doneDate: stage === "DONE" ? row.doneDate : null,
        // Re-approving later notifies SEO again; a Draft click on a test approval goes too.
        seoNotifiedAt: stage === "SHOPIFY_DRAFT" ? row.seoNotifiedAt : null,
        ...(stage === "SHOPIFY_DRAFT" ? {} : { draftClickedDate: null, draftClickedBy: null }),
        // A row with no clicks left takes fresh values again on the next load.
        ...(erp1 || erp2 ? {} : { disableReason: null }),
        // Back before Shopify Draft: nothing from a test approval may remain.
        ...(stage === "SHOPIFY_DRAFT" || stage === "DONE"
          ? {}
          : {
              impressions: null,
              clicks: null,
              ctr: null,
              avgPosition: null,
              verification: null,
              verifiedAt: null,
              madeActiveAgain: false,
              activeDate: null,
              activeAgainNotifiedAt: null,
            }),
      },
    });
    if (stage !== "SHOPIFY_DRAFT" && stage !== "DONE") {
      await prisma.discontinuedItemDraftAttempt.deleteMany({ where: { itemId: row.id } });
    }
  }
  return rows.length;
}

/**
 * Live mode only: removes all test data before anything shows or acts on Discontinued Items
 * (screens, Download history, reminders, the Shopify check and the active-again job). The first
 * call after going live deletes the test rows (see `clearDryRunClicks`) and the "[Test]" bell
 * notifications; after that it is one quick query that finds nothing.
 */
export async function clearTestDataIfLive(): Promise<void> {
  if (isDiscontinueTestMode()) return;
  const cleared = await clearDryRunClicks();
  if (cleared > 0) {
    await prisma.notification.deleteMany({
      where: { type: { startsWith: "discontinued_" }, title: { startsWith: "[Test] " } },
    });
  }
}

/**
 * Purchasing Approval list: every variant SKU whose ERP Product Priority is Discontinue and
 * whose stock (every warehouse, every ERP) is 0 — from Stock Health's live ERP data, per
 * variant SKU (not grouped by Common SKU).
 *
 * The first load of a SKU creates its row; later loads never duplicate it. Rows nobody has
 * clicked yet get their name / priority / Max Sale Qty / Present in refreshed; once a button
 * is clicked the row is frozen. Rows with a click stay listed even if the SKU stops qualifying.
 */
export async function loadPurchasingApproval(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<PurchasingApprovalData> {
  const testMode = isDiscontinueTestMode();
  await clearTestDataIfLive();

  const [live, sales] = await Promise.all([
    getLiveStockHealthData(companyId, options),
    getSalesBudgetSalesData(companyId),
  ]);

  // Max Sale Qty: Sales Budget's Highest Sale Qty rule (best single completed month, all
  // channels) over the last MAX_SALE_MONTHS completed months — the current month is excluded.
  const windowStart = `${addMonths(sales.currentMonth, -MAX_SALE_MONTHS)}-01`;
  const maxSaleOf = (sku: string) =>
    maxSaleQtyInWindow(unitsByMonth(sales.bySku.get(skuKey(sku))), windowStart, sales.currentMonth);

  const candidates = new Map<string, Prisma.DiscontinuedItemCreateManyInput>();
  for (const item of live.items) {
    if (stockHealthStatusOf(item.priority) !== "Discontinue") continue;
    if (!isZeroStock(live.stockBySku.get(skuKey(item.sku)) ?? 0)) continue;
    const presentIn = presenceOf(Boolean(item.inErp1), Boolean(item.inErp2));
    if (!presentIn) continue;
    candidates.set(skuKey(item.sku), {
      sku: item.sku,
      productTitle: item.itemName,
      priorityStatus: item.priority,
      maxSaleQty: maxSaleOf(item.sku),
      presentIn,
    });
  }

  const existing = await prisma.discontinuedItem.findMany();
  const existingByKey = new Map(existing.map((row) => [skuKey(row.sku), row]));

  const toCreate = [...candidates.entries()]
    .filter(([key]) => !existingByKey.has(key))
    .map(([, data]) => data);
  if (toCreate.length > 0) {
    await prisma.discontinuedItem.createMany({ data: toCreate, skipDuplicates: true });
  }

  const refreshes: Prisma.PrismaPromise<unknown>[] = [];
  for (const [key, data] of candidates) {
    const row = existingByKey.get(key);
    if (!row || hasAnyClick(row)) continue;
    if (
      row.productTitle !== data.productTitle ||
      row.priorityStatus !== data.priorityStatus ||
      row.maxSaleQty !== data.maxSaleQty ||
      row.presentIn !== data.presentIn
    ) {
      refreshes.push(
        prisma.discontinuedItem.update({
          where: { id: row.id },
          data: {
            productTitle: data.productTitle,
            priorityStatus: data.priorityStatus,
            maxSaleQty: data.maxSaleQty,
            presentIn: data.presentIn,
          },
        }),
      );
    }
  }
  if (refreshes.length > 0) await prisma.$transaction(refreshes);

  const rows = await prisma.discontinuedItem.findMany({ orderBy: { sku: "asc" } });
  return {
    rows: rows.filter((row) => candidates.has(skuKey(row.sku)) || hasAnyClick(row)).map(toRow),
    testMode,
    fetchedAt: live.fetchedAt.toISOString(),
  };
}

/** ERP 1 / ERP 2 credentials, matched the same way Stock Health reads them. */
async function erpCredentialsFor(companyId: string, erp: DiscontinueErp): Promise<OsfErpCredentials> {
  const instances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(instances);
  const slot = erp === "erp1" ? slots.erp1 : slots.erp2;
  const instance = instances.find((i) => i.id === slot?.id);
  if (!instance) throw new OsfErpError(`${erp === "erp1" ? "ERP 1" : "ERP 2"} is not configured`);
  return instance.cfg;
}

/** ERP server method that saves a doc as a given ERP user (same one Item Creation / Payment Entry use). */
const ERP_OWNER_SAVE_METHOD = process.env.ITEM_CREATION_ERP_SAVE_METHOD?.trim() || "cosmo_save_doc";

async function erpRequest<T>(
  cfg: OsfErpCredentials,
  method: "GET" | "PUT" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext ${method} ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** The ERP has no owner-save method, or it does not know / allow this ERP user. */
function shouldFallBackToApiUser(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/\[404\]/.test(error.message) || /ERP user is (required|disabled or missing)/i.test(error.message))
  );
}

/**
 * LIVE ERP write: ticks the Item's "Disabled" checkbox (ERPNext `disabled = 1`). Only called
 * when test mode is off.
 *
 * Saved through `cosmo_save_doc` as the clicking Cosmo OS user's ERP user (their ERP username,
 * else email), so ERPNext's "modified by" and activity log show that person. If that ERP has no
 * such method or does not accept the user, falls back to PUT /api/resource/Item/{sku} as the
 * API user. Either way the Item is read back and must show Disabled.
 */
async function disableItemInErp(
  cfg: OsfErpCredentials,
  sku: string,
  erpOwner: string,
): Promise<{ savedAsOwner: boolean }> {
  const path = `/api/resource/Item/${encodeURIComponent(sku)}`;
  let savedAsOwner = false;
  if (erpOwner) {
    try {
      await erpRequest(cfg, "POST", `/api/method/${encodeURIComponent(ERP_OWNER_SAVE_METHOD)}`, {
        owner: erpOwner,
        action: "update",
        doc: { doctype: "Item", name: sku, disabled: 1 },
      });
      savedAsOwner = true;
    } catch (error) {
      if (!shouldFallBackToApiUser(error)) throw error;
      console.warn(`Discontinued Items: ${sku} saved as the API user (${(error as Error).message})`);
    }
  }
  if (!savedAsOwner) await erpRequest(cfg, "PUT", path, { disabled: 1 });

  const check = await erpRequest<{ data?: { disabled?: number } }>(cfg, "GET", path);
  if (Number(check.data?.disabled) !== 1) {
    throw new OsfErpError(`ERPNext did not confirm ${sku} as disabled`);
  }
  return { savedAsOwner };
}

/**
 * One ERP button click. Irreversible: a side that is already done can never be clicked again.
 * The remark (saved as disable_reason) is mandatory.
 */
export async function disableDiscontinuedItem(input: {
  companyId: string;
  sku: string;
  erp: DiscontinueErp;
  remark: string;
  userName: string;
  /** The clicker's ERP user (erpDocumentOwner): ERPNext shows them as the editor. */
  erpOwner: string;
}): Promise<{ row: PurchasingApprovalRow; testMode: boolean }> {
  const remark = input.remark.trim();
  if (!remark) throw new PurchasingApprovalError("Enter a remark before disabling the item.", 400);
  if (remark.length > REMARK_MAX) {
    throw new PurchasingApprovalError(`Remark must be ${REMARK_MAX} characters or fewer.`, 400);
  }

  const row = await prisma.discontinuedItem.findUnique({ where: { sku: input.sku } });
  if (!row) throw new PurchasingApprovalError("Item not found. Reload the list.", 404);
  if (!applicableErps(row.presentIn).includes(input.erp)) {
    throw new PurchasingApprovalError("This item is not in that ERP.", 400);
  }
  const doneField = input.erp === "erp1" ? row.erp1DisabledDate : row.erp2DisabledDate;
  if (doneField) throw new PurchasingApprovalError("Already done for this ERP.", 409);

  const testMode = isDiscontinueTestMode();
  if (!testMode) {
    await disableItemInErp(await erpCredentialsFor(input.companyId, input.erp), row.sku, input.erpOwner);
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // Conditional on the side still being open, so two clicks at once cannot both "win".
    const claim = await tx.discontinuedItem.updateMany({
      where: {
        id: row.id,
        ...(input.erp === "erp1" ? { erp1DisabledDate: null } : { erp2DisabledDate: null }),
      },
      data:
        input.erp === "erp1"
          ? { erp1DisabledDate: now, erp1DisabledBy: input.userName, erp1DryRun: testMode }
          : { erp2DisabledDate: now, erp2DisabledBy: input.userName, erp2DryRun: testMode },
    });
    if (claim.count === 0) throw new PurchasingApprovalError("Already done for this ERP.", 409);

    const current = await tx.discontinuedItem.findUniqueOrThrow({ where: { id: row.id } });
    const stage = stageAfterClicks(current.presentIn, {
      erp1: Boolean(current.erp1DisabledDate),
      erp2: Boolean(current.erp2DisabledDate),
    });
    return tx.discontinuedItem.update({
      where: { id: row.id },
      data: {
        disableReason: remark,
        stage,
        approvedDate: stage === "SHOPIFY_DRAFT" || stage === "DONE" ? now : null,
        doneDate: stage === "DONE" ? now : null,
      },
    });
  });

  return { row: toRow(updated), testMode };
}
