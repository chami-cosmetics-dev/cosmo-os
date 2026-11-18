import ExcelJS from "exceljs";

import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { addNoRopSheets } from "@/lib/shop-stock-status/no-rop-workbook";
import {
  SHOP_STOCK_TAB_COLUMNS,
  shopStockBandOf,
  type ShopStockBand,
  type ShopStockColumn,
  type ShopStockRow,
  type ShopStockStatus,
} from "@/lib/shop-stock-status/config";

const NAVY = "FF17365D";
/** Location headings alternate between two bands so each location's 3 columns stand out. */
const LOCATION_HEAD_FILLS = ["FF1F4E79", "FF2E75B6"];
const LOCATION_SUBHEAD_FILLS = ["FFBDD7EE", "FFDDEBF7"];
/** Same colours as the screen: red / yellow / green. */
const BAND_FILL: Record<ShopStockBand, string> = { fail: "FFF8CBAD", pass: "FFFFF2CC", full: "FFC6EFCE" };
const FIXED_COLUMNS = ["Common SKU", "Item name", "Priority"];
const STATUS_COLUMNS = ["Fail", "Pass", "Status"];
/** Rows 1–4: title, downloaded, stock as of, filters (or blank). Rows 5–6: headers. Data from row 7. */
export const HEADER_ROW = 5;
export const FIRST_DATA_ROW = HEADER_ROW + 2;

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/**
 * Title and time lines, two header rows (location over Stock / ROP / %), then one row per
 * Common SKU — as on the screen. The headers and the Common SKU column are frozen.
 */
export function addLocationSheet(
  wb: ExcelJS.Workbook,
  name: string,
  rows: ShopStockRow[],
  columns: ShopStockColumn[],
  times: { downloadedAt: string; stockAsOf: string },
  /** Filtered export: the filters applied on the screen, written on row 4. */
  filters?: string,
) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", xSplit: 1, ySplit: HEADER_ROW + 1 }],
  });
  const firstLocationCol = FIXED_COLUMNS.length + 1;
  const firstStatusCol = firstLocationCol + columns.length * 3;
  const lastCol = firstStatusCol + STATUS_COLUMNS.length - 1;

  ws.columns = [
    { width: 16 },
    { width: 44 },
    { width: 13 },
    ...columns.flatMap(() => [{ width: 9 }, { width: 9 }, { width: 9 }]),
    { width: 7 },
    { width: 7 },
    { width: 18 },
  ];

  ws.getCell(1, 1).value = `Shop Stock Status — ${name}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(2, 1).value = `Downloaded: ${times.downloadedAt}`;
  ws.getCell(3, 1).value = `Live ERP stock as of: ${times.stockAsOf} (stock changes — figures are as of this time)`;
  for (const r of [2, 3]) ws.getCell(r, 1).font = { italic: true };
  if (filters) {
    ws.getCell(4, 1).value = `Filters: ${filters}`;
    ws.getCell(4, 1).font = { bold: true, color: { argb: "FFC00000" } };
  }

  // Headers: Common SKU / Item name / Priority and the status columns span both header rows.
  const navyHead = (r: number, c: number, value: string) => {
    const cell = ws.getCell(r, c);
    cell.value = value;
    cell.fill = solid(NAVY);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  };
  [...FIXED_COLUMNS, ...STATUS_COLUMNS].forEach((label, i) => {
    const c = i < FIXED_COLUMNS.length ? i + 1 : firstStatusCol + i - FIXED_COLUMNS.length;
    navyHead(HEADER_ROW, c, label);
    navyHead(HEADER_ROW + 1, c, "");
    ws.mergeCells(HEADER_ROW, c, HEADER_ROW + 1, c);
  });
  columns.forEach((column, i) => {
    const c = firstLocationCol + i * 3;
    const head = ws.getCell(HEADER_ROW, c);
    head.value = column.label;
    head.fill = solid(LOCATION_HEAD_FILLS[i % 2]);
    head.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    head.alignment = { horizontal: "center", vertical: "middle" };
    ws.mergeCells(HEADER_ROW, c, HEADER_ROW, c + 2);
    ["Stock", "ROP", "%"].forEach((label, j) => {
      const sub = ws.getCell(HEADER_ROW + 1, c + j);
      sub.value = label;
      sub.fill = solid(LOCATION_SUBHEAD_FILLS[i % 2]);
      sub.font = { bold: true, color: { argb: NAVY } };
      sub.alignment = { horizontal: "center", vertical: "middle" };
    });
  });
  ws.getRow(HEADER_ROW).height = 24;

  rows.forEach((row, i) => {
    const excelRow = ws.getRow(FIRST_DATA_ROW + i);
    excelRow.getCell(1).value = row.commonSku;
    excelRow.getCell(2).value = row.itemName ?? "";
    excelRow.getCell(3).value = row.priority;
    columns.forEach((column, j) => {
      const c = firstLocationCol + j * 3;
      const cell = row.cells[column.key];
      excelRow.getCell(c).value = cell.stock;
      excelRow.getCell(c + 1).value = cell.rop;
      const pct = excelRow.getCell(c + 2);
      if (cell.percent === null) {
        pct.value = "-";
        pct.alignment = { horizontal: "center" };
      } else {
        pct.value = cell.percent / 100;
        pct.numFmt = "0.0%";
        pct.fill = solid(BAND_FILL[shopStockBandOf(cell.percent)]);
      }
    });
    excelRow.getCell(firstStatusCol).value = row.fail;
    excelRow.getCell(firstStatusCol + 1).value = row.pass;
    excelRow.getCell(firstStatusCol + 2).value = `Fail: ${row.fail} | Pass: ${row.pass}`;
  });

  // A navy line before each location (and the status columns), headers to the last row.
  const lastRow = FIRST_DATA_ROW + rows.length - 1;
  const edges = [...columns.map((_, i) => firstLocationCol + i * 3), firstStatusCol];
  for (let r = HEADER_ROW; r <= Math.max(lastRow, HEADER_ROW + 1); r += 1) {
    for (const c of edges) {
      ws.getCell(r, c).border = { left: { style: "medium", color: { argb: NAVY } } };
    }
  }
  ws.getCell(HEADER_ROW, lastCol).border = { right: { style: "medium", color: { argb: NAVY } } };
}

/**
 * The "Export (SHOP + ONLINE)" file: SHOP and ONLINE sheets (all Common SKUs), then NO ROP - SHOP
 * and NO ROP - ONLINE (the NO ROP tab's two views, all items). Shared by the screen's export and
 * the Monday Stock Availability Status mail (attached).
 */
export async function buildShopStockStatusWorkbook(
  status: Pick<ShopStockStatus, "tabs" | "fetchedAt">,
  downloadedAtDate = new Date(),
): Promise<{ fileName: string; buffer: Buffer }> {
  const downloadedAt = formatAppIsoDateTime(downloadedAtDate);
  // The stock can be up to an hour older than the download (shared ERP cache).
  const times = { downloadedAt, stockAsOf: formatAppIsoDateTime(new Date(status.fetchedAt)) };

  const wb = new ExcelJS.Workbook();
  addLocationSheet(wb, "SHOP", status.tabs.shops, SHOP_STOCK_TAB_COLUMNS.shops, times);
  addLocationSheet(wb, "ONLINE", status.tabs.online, SHOP_STOCK_TAB_COLUMNS.online, times);
  addNoRopSheets(wb, status, times);

  // e.g. shop-stock-status-2026-11-10_11-18.xlsx (no ":" — not allowed in file names).
  const stamp = downloadedAt.slice(0, 16).replace(" ", "_").replace(":", "-");
  return {
    fileName: `shop-stock-status-${stamp}.xlsx`,
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}
