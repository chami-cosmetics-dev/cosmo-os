import ExcelJS from "exceljs";

import { formatAppIsoDateTime } from "@/lib/format-datetime";
import type { ShopStockColumn, ShopStockStatus } from "@/lib/shop-stock-status/config";
import {
  applyNoRopFilters,
  buildNoRopRows,
  DEFAULT_NO_ROP_FILTERS,
  NO_ROP_CHANNEL_COLUMNS,
  NO_ROP_CHANNEL_LABELS,
  NO_ROP_CHANNELS,
  type NoRopChannel,
  type NoRopRow,
} from "@/lib/shop-stock-status/no-rop";

const NAVY = "FF17365D";
/** Rows 1–4: title, downloaded, stock as of, item count + filters. Row 5: headers. Data from row 6. */
export const NO_ROP_HEADER_ROW = 5;

/** Sheet names in the main "Export (SHOP + ONLINE)" file, after SHOP and ONLINE. */
export const NO_ROP_SHEET_NAMES: Record<NoRopChannel, string> = {
  shops: "NO ROP - SHOP",
  online: "NO ROP - ONLINE",
};

/** One view's rows as a sheet, in the screen's order and layout. */
function addNoRopSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  rows: NoRopRow[],
  channel: NoRopChannel,
  filters: string,
  times: { downloadedAt: string; stockAsOf: string },
) {
  const columns: ShopStockColumn[] = NO_ROP_CHANNEL_COLUMNS[channel];
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", xSplit: 1, ySplit: NO_ROP_HEADER_ROW }],
  });
  ws.columns = [{ width: 16 }, { width: 44 }, { width: 13 }, ...columns.map(() => ({ width: 12 })), { width: 10 }];

  ws.getCell(1, 1).value = `Shop Stock Status — NO ROP (No ROP - With Stock) — ${NO_ROP_CHANNEL_LABELS[channel]}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(2, 1).value = `Downloaded: ${times.downloadedAt}`;
  ws.getCell(3, 1).value = `Live ERP stock as of: ${times.stockAsOf} (stock changes — figures are as of this time)`;
  for (const r of [2, 3]) ws.getCell(r, 1).font = { italic: true };
  ws.getCell(4, 1).value = `${rows.length} items · Filters: ${filters || "None"}`;
  ws.getCell(4, 1).font = { bold: true, color: { argb: "FFC00000" } };

  const headers = ["Common SKU", "Item name", "Priority", ...columns.map((c) => c.label), "Total"];
  headers.forEach((label, i) => {
    const cell = ws.getCell(NO_ROP_HEADER_ROW, i + 1);
    cell.value = label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  rows.forEach((row, i) => {
    const excelRow = ws.getRow(NO_ROP_HEADER_ROW + 1 + i);
    excelRow.getCell(1).value = row.commonSku;
    excelRow.getCell(2).value = row.itemName ?? "";
    excelRow.getCell(3).value = row.priority;
    columns.forEach((column, j) => {
      const cell = excelRow.getCell(4 + j);
      const stock = row.cells[column.key];
      cell.value = stock ?? "-";
      if (stock == null) cell.alignment = { horizontal: "center" };
    });
    const total = excelRow.getCell(4 + columns.length);
    total.value = row.total;
    total.font = { bold: true };
  });
}

function timesOf(fetchedAt: Date | null, downloadedAtDate: Date) {
  return {
    downloadedAt: formatAppIsoDateTime(downloadedAtDate),
    stockAsOf: fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? formatAppIsoDateTime(fetchedAt) : "-",
  };
}

/** e.g. 2026-11-18_08-49 (no ":" — not allowed in file names). */
function stampOf(downloadedAt: string): string {
  return downloadedAt.slice(0, 16).replace(" ", "_").replace(":", "-");
}

/** NO ROP tab, "Export filtered": the selected view's rows on the screen. */
export async function buildNoRopWorkbook(
  rows: NoRopRow[],
  filters: string,
  fetchedAt: Date | null,
  channel: NoRopChannel = "shops",
  downloadedAtDate = new Date(),
): Promise<{ fileName: string; buffer: Buffer }> {
  const times = timesOf(fetchedAt, downloadedAtDate);
  const wb = new ExcelJS.Workbook();
  addNoRopSheet(wb, "NO ROP", rows, channel, filters, times);
  return {
    fileName: `shop-stock-status-no-rop-${channel === "online" ? "online-channels" : "shops"}-filtered-${stampOf(times.downloadedAt)}.xlsx`,
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}

/**
 * The main "Export (SHOP + ONLINE)" file's last two sheets: the NO ROP tab's Shops and Online
 * channels views, every qualifying item (no filters, default sort: Total lowest to highest).
 */
export function addNoRopSheets(
  wb: ExcelJS.Workbook,
  status: Pick<ShopStockStatus, "tabs">,
  times: { downloadedAt: string; stockAsOf: string },
) {
  const sourceRows = { shops: status.tabs.shops, online: status.tabs.online };
  for (const channel of NO_ROP_CHANNELS) {
    const rows = applyNoRopFilters(
      buildNoRopRows(sourceRows[channel], NO_ROP_CHANNEL_COLUMNS[channel]),
      DEFAULT_NO_ROP_FILTERS,
    );
    addNoRopSheet(wb, NO_ROP_SHEET_NAMES[channel], rows, channel, "None (all items)", times);
  }
}
