import ExcelJS from "exceljs";

import { monthLabel, type NewlyAddedReview, type NewlyAddedReviewRow } from "@/lib/newly-added-review/calc";

const NAVY = "FF17365D";
export const NEWLY_ADDED_SHEETS = { needsCheck: "Needs Priority Check", all: "All Newly Added" } as const;
export const NEWLY_ADDED_COLUMNS = [
  "SKU",
  "Product title",
  "Priority status",
  "Created date",
  "Duration (months)",
  "Current stock",
] as const;
/** Sheet 1 only, after Current stock. */
export const MAX_SALE_COLUMN = "Max Sale Qty";
/** Row 1: title. Row 2: note. Row 3: headers. Data from row 4. */
export const NEWLY_ADDED_HEADER_ROW = 3;

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  note: string,
  rows: NewlyAddedReviewRow[],
  options: { maxSale?: boolean } = {},
) {
  const headers: string[] = [...NEWLY_ADDED_COLUMNS, ...(options.maxSale ? [MAX_SALE_COLUMN] : [])];
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", xSplit: 1, ySplit: NEWLY_ADDED_HEADER_ROW }],
  });
  ws.columns = [
    { width: 18 }, { width: 56 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 14 },
    ...(options.maxSale ? [{ width: 14 }] : []),
  ];
  ws.getCell(1, 1).value = name;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(2, 1).value = note;
  ws.getCell(2, 1).font = { italic: true };

  headers.forEach((label, i) => {
    const cell = ws.getCell(NEWLY_ADDED_HEADER_ROW, i + 1);
    cell.value = label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.autoFilter = {
    from: { row: NEWLY_ADDED_HEADER_ROW, column: 1 },
    to: { row: NEWLY_ADDED_HEADER_ROW, column: headers.length },
  };

  rows.forEach((row, i) => {
    const r = ws.getRow(NEWLY_ADDED_HEADER_ROW + 1 + i);
    r.getCell(1).value = row.sku;
    r.getCell(2).value = row.productTitle ?? "";
    r.getCell(3).value = row.priorityStatus;
    r.getCell(4).value = row.createdDate ?? "-";
    r.getCell(5).value = row.durationMonths ?? "-";
    r.getCell(6).value = row.currentStock;
    if (options.maxSale) r.getCell(7).value = row.maxSaleQty ?? 0;
    for (const c of [4, 5]) r.getCell(c).alignment = { horizontal: "center" };
  });
}

/** The mail's attachment: Sheet 1 Needs Priority Check, Sheet 2 All Newly Added. */
export async function buildNewlyAddedReviewWorkbook(
  review: NewlyAddedReview,
  stockAsOf: string,
): Promise<{ fileName: string; buffer: Buffer }> {
  const wb = new ExcelJS.Workbook();
  const month = monthLabel(review.mailMonth);
  addSheet(
    wb,
    NEWLY_ADDED_SHEETS.needsCheck,
    `${month} review · ${review.needsCheck.length} items Newly Added for 3 full months or more — move each to Top, Low or Discontinue. Stock as of ${stockAsOf}. Max Sale Qty = most units sold in one month, from the created month to the month before this mail (all channels).`,
    review.needsCheck,
    { maxSale: true },
  );
  addSheet(
    wb,
    NEWLY_ADDED_SHEETS.all,
    `${month} review · all ${review.all.length} items currently Newly Added. Stock as of ${stockAsOf}.`,
    review.all,
  );
  return {
    fileName: `newly-added-priority-review-${review.mailMonth}.xlsx`,
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}
