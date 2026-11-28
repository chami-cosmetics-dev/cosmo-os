import "server-only";

import type { DiscontinuedSearchConsoleReport, Prisma } from "@prisma/client";
import * as XLSX from "xlsx-js-style";

import { completeAlreadyDraftedItemsSafely } from "@/lib/discontinued-items/already-drafted.server";
import {
  clearTestDataIfLive,
  PurchasingApprovalError,
} from "@/lib/discontinued-items/purchasing-approval.server";
import {
  mergedMetricsOf,
  parseSearchConsoleSheets,
  type HandleMetricsTuple,
} from "@/lib/discontinued-items/search-console";
import {
  checkReportContents,
  checkReportCreatedToday,
  fileCreatedDate,
} from "@/lib/discontinued-items/search-console-checks";
import {
  REDIRECTION_LINK_MAX,
  type SearchConsoleReportInfo,
  type ShopifyDraftData,
  type ShopifyDraftRow,
} from "@/lib/discontinued-items/shopify-draft";
import { formatAppIsoDate, parseAppCalendarDayStart } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { skuKey } from "@/lib/stock-health/calc";

/** Shopify Draft list: approved for drafting (ERP 1 only / both — the SHOPIFY_DRAFT status), not done. */
const SHOPIFY_DRAFT_WHERE: Prisma.DiscontinuedItemWhereInput = { stage: "SHOPIFY_DRAFT" };

/** Figures saved on items not drafted yet are cleared with the report; drafted items keep theirs. */
const clearUndraftedFigures = () =>
  prisma.discontinuedItem.updateMany({
    where: { ...SHOPIFY_DRAFT_WHERE, draftClickedDate: null },
    data: { impressions: null, clicks: null, ctr: null, avgPosition: null },
  });

/**
 * The current Search Console report. A report is valid only if its file was created today
 * (Asia/Colombo; checked on upload): from the next day it is removed here — like the Remove
 * button — so a fresh export is needed.
 */
async function latestReport(now: Date = new Date()): Promise<DiscontinuedSearchConsoleReport | null> {
  const todayStart = parseAppCalendarDayStart(formatAppIsoDate(now));
  if (todayStart) {
    const expired = await prisma.discontinuedSearchConsoleReport.deleteMany({
      where: { OR: [{ fileCreatedAt: { lt: todayStart } }, { uploadedAt: { lt: todayStart } }] },
    });
    if (expired.count > 0 && (await prisma.discontinuedSearchConsoleReport.count()) === 0) {
      await clearUndraftedFigures();
    }
  }
  return prisma.discontinuedSearchConsoleReport.findFirst({ orderBy: { uploadedAt: "desc" } });
}

function reportInfo(report: DiscontinuedSearchConsoleReport): SearchConsoleReportInfo {
  return {
    fileName: report.fileName,
    uploadedBy: report.uploadedBy,
    uploadedAt: report.uploadedAt.toISOString(),
    fileCreatedAt: report.fileCreatedAt?.toISOString() ?? null,
    pagesRead: report.pagesRead,
    productRows: report.productRows,
    skippedRows: report.skippedRows,
    handleCount: report.handleCount,
    warnings: Array.isArray(report.warnings) ? (report.warnings as string[]) : [],
  };
}

/** Variant SKU → Shopify product handle, from the synced Shopify products (lower-cased). */
async function handlesBySku(companyId: string, skus: string[]): Promise<Map<string, string>> {
  if (skus.length === 0) return new Map();
  const products = await prisma.productItem.findMany({
    where: { companyId, sku: { in: skus }, handle: { not: null } },
    select: { sku: true, handle: true },
    orderBy: { updatedAt: "desc" },
  });
  const out = new Map<string, string>();
  for (const product of products) {
    const key = skuKey(product.sku ?? "");
    if (key && product.handle && !out.has(key)) out.set(key, product.handle.trim().toLowerCase());
  }
  return out;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * Shopify Draft list with Search Console figures merged per handle (no matching URL → zeros).
 * The figures are saved on the item until Draft is clicked, then frozen as they were.
 */
export async function loadShopifyDraft(companyId: string): Promise<ShopifyDraftData> {
  await clearTestDataIfLive();
  // Approved items not checked yet (or whose check failed): already Draft in Shopify → completed.
  await completeAlreadyDraftedItemsSafely();
  const [items, report] = await Promise.all([
    prisma.discontinuedItem.findMany({
      where: SHOPIFY_DRAFT_WHERE,
      orderBy: { sku: "asc" },
      include: { draftAttempts: { orderBy: { clickedAt: "desc" } } },
    }),
    latestReport(),
  ]);
  const handles = await handlesBySku(
    companyId,
    items.map((item) => item.sku),
  );
  const metrics = (report?.metrics ?? {}) as Record<string, HandleMetricsTuple>;

  const updates: Prisma.PrismaPromise<unknown>[] = [];
  const rows: ShopifyDraftRow[] = items.map((item) => {
    const handle = handles.get(skuKey(item.sku)) ?? null;
    let figures = {
      impressions: item.impressions ?? 0,
      clicks: item.clicks ?? 0,
      ctr: item.ctr != null ? Number(item.ctr) : 0,
      avgPosition: item.avgPosition != null ? Number(item.avgPosition) : 0,
    };
    if (report && !item.draftClickedDate) {
      const merged = mergedMetricsOf(handle ? metrics[handle] : undefined);
      figures = {
        impressions: merged.impressions,
        clicks: merged.clicks,
        ctr: round(merged.ctr, 4),
        avgPosition: round(merged.avgPosition, 2),
      };
      const changed =
        item.impressions !== figures.impressions ||
        item.clicks !== figures.clicks ||
        (item.ctr == null ? null : Number(item.ctr)) !== figures.ctr ||
        (item.avgPosition == null ? null : Number(item.avgPosition)) !== figures.avgPosition;
      if (changed) {
        updates.push(prisma.discontinuedItem.update({ where: { id: item.id }, data: figures }));
      }
    }
    return {
      sku: item.sku,
      productTitle: item.productTitle,
      priorityStatus: item.priorityStatus,
      handle,
      ...figures,
      redirectionLink: item.redirectionLink,
      draftClickedDate: item.draftClickedDate?.toISOString() ?? null,
      draftClickedBy: item.draftClickedBy,
      testApproval: item.erp1DryRun || item.erp2DryRun,
      mismatch: !item.draftClickedDate && item.verification === "FAIL",
      attempts: item.draftAttempts.map((a) => ({
        clickedAt: a.clickedAt.toISOString(),
        clickedBy: a.clickedBy,
        result: a.result,
        shopifyStatus: a.shopifyStatus,
        checkedAt: a.checkedAt?.toISOString() ?? null,
        lastError: a.lastError,
      })),
    };
  });
  if (updates.length > 0) await prisma.$transaction(updates);

  return { rows, report: report ? reportInfo(report) : null };
}

const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Reads an uploaded Search Console Pages export and saves it as the latest report. A file in a
 * different format is rejected with the reason (nothing is saved). Returns the new list.
 */
export async function saveSearchConsoleReport(input: {
  companyId: string;
  fileName: string;
  bytes: ArrayBuffer;
  userName: string;
}): Promise<ShopifyDraftData> {
  if (input.bytes.byteLength === 0) throw new PurchasingApprovalError("The file is empty.", 400);
  if (input.bytes.byteLength > UPLOAD_MAX_BYTES) {
    throw new PurchasingApprovalError("The file is larger than 10 MB.", 400);
  }

  let sheets: Record<string, unknown[][]>;
  let fileCreatedAt: Date | null;
  try {
    const workbook = XLSX.read(new Uint8Array(input.bytes), { type: "array" });
    // The file's own "created" property (docProps/core.xml), not its name or the upload time.
    fileCreatedAt = fileCreatedDate(workbook.Props?.CreatedDate);
    sheets = Object.fromEntries(
      workbook.SheetNames.map((name) => [
        name,
        XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: true, defval: null }),
      ]),
    );
  } catch {
    throw new PurchasingApprovalError(
      "Could not read the file as Excel. Upload the Search Console export as .xlsx.",
      400,
    );
  }

  // Checked in order before anything is extracted; the first failure rejects the upload.
  const now = new Date();
  for (const check of [checkReportCreatedToday(fileCreatedAt, now), checkReportContents(sheets, now)]) {
    if (!check.ok) throw new PurchasingApprovalError(check.error, 400);
  }

  const parsed = parseSearchConsoleSheets(sheets);
  if (!parsed.ok) throw new PurchasingApprovalError(parsed.error, 400);

  const { report } = parsed;
  await prisma.discontinuedSearchConsoleReport.create({
    data: {
      fileName: input.fileName.slice(0, 255),
      fileCreatedAt,
      uploadedBy: input.userName,
      pagesRead: report.pagesRead,
      productRows: report.productRows,
      skippedRows: report.skippedRows,
      handleCount: Object.keys(report.metrics).length,
      filters: report.filters,
      warnings: report.warnings,
      metrics: report.metrics,
    },
  });
  return loadShopifyDraft(input.companyId);
}

/**
 * Removes the Search Console report (every saved upload, so an older one doesn't take over):
 * Draft is disabled again until a new file is uploaded. Figures saved on items not drafted yet
 * are cleared; drafted items keep theirs (frozen at the Draft click).
 */
export async function removeSearchConsoleReport(companyId: string): Promise<ShopifyDraftData> {
  await prisma.$transaction([prisma.discontinuedSearchConsoleReport.deleteMany({}), clearUndraftedFigures()]);
  return loadShopifyDraft(companyId);
}

async function openShopifyDraftItem(sku: string) {
  const item = await prisma.discontinuedItem.findUnique({ where: { sku } });
  if (!item || item.stage !== "SHOPIFY_DRAFT") {
    throw new PurchasingApprovalError("This item is not waiting for a Shopify draft. Reload the list.", 404);
  }
  return item;
}

function cleanLink(value: unknown): string | null {
  const link = typeof value === "string" ? value.trim() : "";
  if (link.length > REDIRECTION_LINK_MAX) {
    throw new PurchasingApprovalError(`Redirection link must be ${REDIRECTION_LINK_MAX} characters or fewer.`, 400);
  }
  return link || null;
}

/** Optional redirection link; editable until Draft is clicked. */
export async function saveRedirectionLink(sku: string, value: unknown): Promise<string | null> {
  const item = await openShopifyDraftItem(sku);
  if (item.draftClickedDate) throw new PurchasingApprovalError("Already drafted.", 409);
  const redirectionLink = cleanLink(value);
  await prisma.discontinuedItem.update({ where: { id: item.id }, data: { redirectionLink } });
  return redirectionLink;
}

/**
 * Draft button: only records who clicked and when (SEO drafts the product in Shopify by hand —
 * nothing is changed in Shopify here). Irreversible; needs a processed Search Console report.
 */
export async function markDrafted(input: {
  sku: string;
  userName: string;
  redirectionLink?: unknown;
}): Promise<{ draftClickedDate: string; draftClickedBy: string; redirectionLink: string | null }> {
  if (!(await latestReport())) {
    throw new PurchasingApprovalError("Upload the Search Console report before drafting.", 400);
  }
  const item = await openShopifyDraftItem(input.sku);
  if (item.draftClickedDate) throw new PurchasingApprovalError("Already drafted.", 409);
  const redirectionLink = input.redirectionLink === undefined ? item.redirectionLink : cleanLink(input.redirectionLink);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Conditional, so two clicks at once cannot both record.
    const claim = await tx.discontinuedItem.updateMany({
      where: { id: item.id, stage: "SHOPIFY_DRAFT", draftClickedDate: null },
      data: {
        draftClickedDate: now,
        draftClickedBy: input.userName,
        redirectionLink,
        // A new click starts a new check; earlier results stay in the attempt history.
        verification: null,
        verifiedAt: null,
      },
    });
    if (claim.count === 0) throw new PurchasingApprovalError("Already drafted.", 409);
    // Checked in Shopify at 5:30 PM (the daily verification job).
    await tx.discontinuedItemDraftAttempt.create({
      data: { itemId: item.id, clickedAt: now, clickedBy: input.userName },
    });
  });
  return { draftClickedDate: now.toISOString(), draftClickedBy: input.userName, redirectionLink };
}
