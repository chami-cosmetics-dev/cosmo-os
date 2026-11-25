import "server-only";

import ExcelJS from "exceljs";

import { PRESENT_IN_LABELS } from "@/lib/discontinued-items/purchasing-approval";
import { clearTestDataIfLive } from "@/lib/discontinued-items/purchasing-approval.server";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Excel shows date cells as written (no time zone), so shift to Sri Lanka wall-clock time. */
const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const colombo = (value: Date | null) => (value ? new Date(value.getTime() + COLOMBO_OFFSET_MS) : null);

const DATE_FORMAT = "d mmm yyyy, hh:mm";
const HEADER_FILL = "FF17365D";

type Column = { header: string; width: number; numFmt?: string };

/** Item History: one row per item, in this order (the Phase 7 list, then "Test click"). */
const ITEM_COLUMNS: Column[] = [
  { header: "SKU", width: 16 },
  { header: "Product title", width: 44 },
  { header: "Priority status", width: 14 },
  { header: "Max sale qty", width: 12 },
  { header: "Impressions", width: 12 },
  { header: "Clicks", width: 9 },
  { header: "CTR", width: 9, numFmt: "0.00%" },
  { header: "Avg position", width: 12, numFmt: "0.00" },
  { header: "Present in", width: 13 },
  { header: "ERP 1 / Website disabled date", width: 20, numFmt: DATE_FORMAT },
  { header: "ERP 1 / Website disabled by", width: 22 },
  { header: "ERP 2 disabled date", width: 20, numFmt: DATE_FORMAT },
  { header: "ERP 2 disabled by", width: 22 },
  { header: "Reason for disabling", width: 36 },
  { header: "Redirection link", width: 36 },
  { header: "Draft click date", width: 20, numFmt: DATE_FORMAT },
  { header: "Draft clicked by", width: 22 },
  { header: "Verification", width: 12 },
  { header: "Done date", width: 20, numFmt: DATE_FORMAT },
  { header: "Made active again", width: 12 },
  { header: "Active date", width: 20, numFmt: DATE_FORMAT },
  { header: "Test click", width: 18 },
];

const ATTEMPT_COLUMNS: Column[] = [
  { header: "SKU", width: 16 },
  { header: "Attempt number", width: 10 },
  { header: "Click date", width: 20, numFmt: DATE_FORMAT },
  { header: "Clicked by", width: 22 },
  { header: "Verification result", width: 18 },
  { header: "Check time", width: 20, numFmt: DATE_FORMAT },
];

const RESULT_LABELS = {
  AWAITING: "Waiting for check",
  PASS: "Pass",
  FAIL: "Fail (mismatch)",
  CHECK_FAILED: "Check failed",
} as const;

/** Header row styled, frozen, with filters; column widths and number / date formats. */
function addSheet(wb: ExcelJS.Workbook, name: string, columns: Column[], rows: Array<Array<unknown>>) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({
    header: c.header,
    width: c.width,
    ...(c.numFmt ? { style: { numFmt: c.numFmt } } : {}),
  }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 30;
  // null / undefined → a blank cell (never the text "null").
  for (const row of rows) ws.addRow(row.map((v) => (v === null || v === undefined || v === "" ? null : v)));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

/**
 * Full Discontinued Items history (Manager): every saved item — done and removed ones too — one row
 * each, plus every Draft click on the "Draft Attempts" sheet. Two database reads, no ERP/Shopify.
 */
export async function buildDiscontinuedItemsHistoryWorkbook(now: Date = new Date()) {
  await clearTestDataIfLive();
  const [items, attempts] = await Promise.all([
    prisma.discontinuedItem.findMany({ orderBy: { sku: "asc" } }),
    prisma.discontinuedItemDraftAttempt.findMany({
      orderBy: [{ item: { sku: "asc" } }, { clickedAt: "asc" }],
      include: { item: { select: { sku: true } } },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.created = now;

  addSheet(
    wb,
    "Item History",
    ITEM_COLUMNS,
    items.map((item) => {
      const test = [item.erp1DryRun && "ERP 1", item.erp2DryRun && "ERP 2"].filter(Boolean);
      return [
        item.sku,
        item.productTitle,
        item.priorityStatus,
        item.maxSaleQty,
        item.impressions,
        item.clicks,
        item.ctr != null ? Number(item.ctr) : null,
        item.avgPosition != null ? Number(item.avgPosition) : null,
        item.presentIn ? PRESENT_IN_LABELS[item.presentIn] : null,
        colombo(item.erp1DisabledDate),
        item.erp1DisabledBy,
        colombo(item.erp2DisabledDate),
        item.erp2DisabledBy,
        item.disableReason,
        item.redirectionLink,
        colombo(item.draftClickedDate),
        item.draftClickedBy,
        item.verification === "PASS" ? "Pass" : item.verification === "FAIL" ? "Fail" : null,
        colombo(item.doneDate),
        item.madeActiveAgain ? "Yes" : "No",
        colombo(item.activeDate),
        // Test-mode (dry-run) ERP clicks: nothing was disabled in that ERP.
        test.length ? `Yes (${test.join(" & ")})` : null,
      ];
    }),
  );

  const attemptNumber = new Map<string, number>();
  addSheet(
    wb,
    "Draft Attempts",
    ATTEMPT_COLUMNS,
    attempts.map((a) => {
      const n = (attemptNumber.get(a.itemId) ?? 0) + 1;
      attemptNumber.set(a.itemId, n);
      return [a.item.sku, n, colombo(a.clickedAt), a.clickedBy, RESULT_LABELS[a.result], colombo(a.checkedAt)];
    }),
  );

  return {
    fileName: `Discontinued_Items_History_${formatAppIsoDate(now)}.xlsx`,
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}
