import "server-only";

import * as XLSX from "xlsx-js-style";

import { BUDGET_REVENUE_PRICE } from "@/lib/sales-budget/config";
import { type Cell, type SalesBudgetExportSection } from "@/lib/sales-budget/export";

const line = (rgb: string) => ({ style: "thin", color: { rgb } });
const HEADER_BORDER = {
  top: line("FFFFFF"),
  bottom: line("FFFFFF"),
  left: line("FFFFFF"),
  right: line("FFFFFF"),
};
const GRID = line("BFBFBF");
const DATA_BORDER = { top: GRID, bottom: GRID, left: GRID, right: GRID };

const CENTER = { horizontal: "center", vertical: "center", wrapText: true };

/** Item columns (Common SKU, Brand, …): navy, spanning both header rows. */
const FIXED_HEADER = {
  fill: { fgColor: { rgb: "17365D" } },
  font: { bold: true, color: { rgb: "FFFFFF" } },
  alignment: CENTER,
  border: HEADER_BORDER,
};

/** Merchant / shop blocks alternate between two colour sets so each block reads as one. */
const BLOCK_THEMES = [
  { name: "2F5597", header: "D9E1F2", cell: null },
  { name: "1F7A6D", header: "D5EFE9", cell: "F3FAF8" },
] as const;

const entityNameStyle = (i: number) => ({
  fill: { fgColor: { rgb: BLOCK_THEMES[i % 2].name } },
  font: { bold: true, color: { rgb: "FFFFFF" } },
  alignment: CENTER,
  border: HEADER_BORDER,
});
const metricHeaderStyle = (i: number) => ({
  fill: { fgColor: { rgb: BLOCK_THEMES[i % 2].header } },
  font: { bold: true, color: { rgb: "1F1F1F" } },
  alignment: CENTER,
  border: DATA_BORDER,
});
/** Money columns: numbers shown with a thousands separator (1000 → 1,000). */
const MONEY_HEADERS = new Set(["Selling Price", "Compare at Price", "Budgeted Revenue"]);
const MONEY_FORMAT = "#,##0";

const dataStyle = (blockIndex: number | null, numeric: boolean, money: boolean) => {
  const fill = blockIndex == null ? null : BLOCK_THEMES[blockIndex % 2].cell;
  return {
    border: DATA_BORDER,
    alignment: { vertical: "center", horizontal: numeric ? "right" : "left" },
    ...(fill ? { fill: { fgColor: { rgb: fill } } } : {}),
    ...(money ? { numFmt: MONEY_FORMAT } : {}),
  };
};

/** Bottom TOTAL row (data sheets) and Total lines (SUMMARY). */
const TOTAL_ROW_STYLE = {
  font: { bold: true },
  fill: { fgColor: { rgb: "FFF2CC" } },
};

/**
 * SUMMARY sheet: for every data sheet, each merchant / shop's month target, Target % and
 * Budgeted Revenue total, then the sheet's Total line.
 */
function buildSummarySheet(sections: SalesBudgetExportSection[]) {
  const header = [
    "Sheet",
    "Merchant / Shop",
    "Month Target",
    "Target %",
    "Budgeted Qty",
    "Budgeted Revenue",
  ];
  const aoa: Cell[][] = [header];
  const totalRows: number[] = [];
  const pct = (v: number | null) => (v == null ? "" : Math.round(v * 10) / 10);
  for (const section of sections) {
    section.entities.forEach((name, i) => {
      const t = section.entityTotals[i];
      aoa.push([
        section.sheetName,
        name,
        t.target ?? "",
        pct(t.percent),
        t.qty ?? "",
        t.revenue ?? "",
      ]);
    });
    totalRows.push(aoa.length);
    aoa.push([
      section.sheetName,
      "Total",
      section.totalTarget ?? "",
      section.totalTarget != null ? 100 : "",
      sumCells(section.entityTotals.map((t) => t.qty ?? "")),
      sumCells(section.entityTotals.map((t) => t.revenue ?? "")),
    ]);
    aoa.push(header.map(() => ""));
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 0; r < aoa.length; r += 1) {
    const blankLine = r > 0 && aoa[r][0] === "";
    for (let c = 0; c < header.length; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[ref] ?? { t: "s", v: "" };
      if (r === 0) cell.s = FIXED_HEADER;
      else if (!blankLine) {
        const numeric = typeof cell.v === "number";
        const money = numeric && (c === 2 || c === 5);
        cell.s = {
          ...dataStyle(null, numeric, money),
          ...(totalRows.includes(r) ? TOTAL_ROW_STYLE : {}),
        };
        if (money) cell.z = MONEY_FORMAT;
      }
      sheet[ref] = cell;
    }
  }
  sheet["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 18 }];
  sheet["!rows"] = [{ hpt: 24 }];
  return sheet;
}

/**
 * Row 1: item headers (merged down over 2 rows) + each merchant / shop name across its block.
 * Row 2: the block's metric headers. Then one row per item.
 */
/** Item-wise total block at the right end: sums across every merchant / shop block. */
const ITEM_TOTAL_HEADERS = ["Total Budgeted Qty", "Total Budgeted Revenue"];
const ITEM_TOTAL_NAME_STYLE = {
  fill: { fgColor: { rgb: "BF8F00" } },
  font: { bold: true, color: { rgb: "FFFFFF" } },
  alignment: CENTER,
  border: HEADER_BORDER,
};
const ITEM_TOTAL_HEADER_STYLE = {
  fill: { fgColor: { rgb: "FFE699" } },
  font: { bold: true, color: { rgb: "1F1F1F" } },
  alignment: CENTER,
  border: DATA_BORDER,
};
const ITEM_TOTAL_CELL = { font: { bold: true }, fill: { fgColor: { rgb: "FFF2CC" } } };

/** Sum of the numbers among `cells`; "" when none is a number. */
export function sumCells(cells: Cell[]): Cell {
  const nums = cells.filter((c): c is number => typeof c === "number");
  return nums.length === 0 ? "" : Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
}

/**
 * Row 1: item headers (merged down over 2 rows) + each merchant / shop name across its block
 * + the item-wise TOTAL block. Row 2: metric headers. Then one row per item, then TOTAL.
 */
function buildSheet(section: SalesBudgetExportSection) {
  const fixedCount = section.fixedHeaders.length;
  const METRIC_COUNT = section.metricHeaders.length;
  const blocksEnd = fixedCount + section.entities.length * METRIC_COUNT;
  const width = blocksEnd + ITEM_TOTAL_HEADERS.length;
  const qtyOffset = section.metricHeaders.indexOf("Budgeted Qty");
  const revenueOffset = section.metricHeaders.indexOf("Budgeted Revenue");
  const blockCell = (i: number, offset: number) => fixedCount + i * METRIC_COUNT + offset;
  const totalLabel = section.sheetName === "ONLINE" ? "TOTAL (ALL MERCHANTS)" : "TOTAL (ALL SHOPS)";

  const nameRow: Cell[] = [...section.fixedHeaders];
  const metricRow: Cell[] = Array.from<Cell>({ length: fixedCount }).fill("");
  section.entities.forEach((name) => {
    nameRow.push(name.toUpperCase(), ...Array.from<Cell>({ length: METRIC_COUNT - 1 }).fill(""));
    metricRow.push(...section.metricHeaders);
  });
  nameRow.push(totalLabel, "");
  metricRow.push(...ITEM_TOTAL_HEADERS);

  const dataRows = section.rows.map((row) => {
    const cells = [
      ...row.fixed,
      ...row.metrics.flatMap((m) => m ?? Array.from<Cell>({ length: METRIC_COUNT }).fill("")),
    ];
    // Item-wise totals across every merchant / shop block.
    const qty = sumCells(section.entities.map((_, i) => cells[blockCell(i, qtyOffset)]));
    const revenue = sumCells(section.entities.map((_, i) => cells[blockCell(i, revenueOffset)]));
    return [...cells, qty, revenue];
  });

  // Last row: each block's Budgeted Qty / Revenue totals, then the grand totals.
  const totalRow: Cell[] = Array.from<Cell>({ length: width }).fill("");
  totalRow[0] = "TOTAL";
  section.entityTotals.forEach((t, i) => {
    totalRow[blockCell(i, qtyOffset)] = t.qty ?? "";
    totalRow[blockCell(i, revenueOffset)] = t.revenue ?? "";
  });
  totalRow[blocksEnd] = sumCells(dataRows.map((r) => r[blocksEnd]));
  totalRow[blocksEnd + 1] = sumCells(dataRows.map((r) => r[blocksEnd + 1]));
  dataRows.push(totalRow);

  const sheet = XLSX.utils.aoa_to_sheet([nameRow, metricRow, ...dataRows]);

  const merges: XLSX.Range[] = section.fixedHeaders.map((_, c) => ({
    s: { r: 0, c },
    e: { r: 1, c },
  }));
  section.entities.forEach((_, i) => {
    const start = blockCell(i, 0);
    merges.push({ s: { r: 0, c: start }, e: { r: 0, c: start + METRIC_COUNT - 1 } });
  });
  merges.push({ s: { r: 0, c: blocksEnd }, e: { r: 0, c: width - 1 } });
  sheet["!merges"] = merges;

  const style = (r: number, c: number, s: object) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    sheet[ref] = { ...(sheet[ref] ?? { t: "s", v: "" }), s };
  };
  for (let c = 0; c < width; c += 1) {
    const itemTotal = c >= blocksEnd;
    const block =
      c < fixedCount || itemTotal ? null : Math.floor((c - fixedCount) / METRIC_COUNT);
    if (itemTotal) {
      style(0, c, ITEM_TOTAL_NAME_STYLE);
      style(1, c, ITEM_TOTAL_HEADER_STYLE);
    } else if (block == null) {
      style(0, c, FIXED_HEADER);
      style(1, c, FIXED_HEADER);
    } else {
      style(0, c, entityNameStyle(block));
      style(1, c, metricHeaderStyle(block));
    }
    const header = c < fixedCount ? section.fixedHeaders[c] : metricRow[c];
    const money = MONEY_HEADERS.has(String(header)) || header === "Total Budgeted Revenue";
    for (let r = 0; r < dataRows.length; r += 1) {
      const value = dataRows[r][c];
      const numeric = typeof value === "number";
      let s: object = dataStyle(block, numeric || c >= fixedCount || money, money && numeric);
      if (itemTotal) s = { ...s, ...ITEM_TOTAL_CELL };
      if (r === dataRows.length - 1) s = { ...s, ...TOTAL_ROW_STYLE };
      style(r + 2, c, s);
      if (money && numeric) sheet[XLSX.utils.encode_cell({ r: r + 2, c })].z = MONEY_FORMAT;
    }
  }

  sheet["!cols"] = section.fixedHeaders
    .map((h) => ({ wch: h === "Product Title" ? 50 : h === "Brand" ? 18 : 12 }))
    .concat(Array.from({ length: blocksEnd - fixedCount }, () => ({ wch: 12 })))
    .concat([{ wch: 14 }, { wch: 16 }]);
  sheet["!rows"] = [{ hpt: 22 }, { hpt: 32 }];
  return sheet;
}

const FREEZE_ROWS = 2;

/** Freeze after the Common SKU column (column A on every sheet). */
const freezeColumns = (section: SalesBudgetExportSection) =>
  section.fixedHeaders.indexOf("Common SKU") + 1;

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * xlsx-js-style (SheetJS 0.18) ignores "!freeze" / "!views", so write the frozen pane into
 * each sheet's <sheetView> directly. `panes[i]` applies to sheet i + 1.
 */
function applyFreezePanes(
  buffer: Buffer,
  panes: Array<{ xSplit: number; ySplit: number }>,
): Buffer {
  const zip = XLSX.CFB.read(buffer, { type: "buffer" });
  zip.FullPaths.forEach((path: string, i: number) => {
    const match = path.match(/xl\/worksheets\/sheet(\d+)\.xml$/);
    const pane = match ? panes[Number(match[1]) - 1] : undefined;
    if (!pane) return;
    const file = zip.FileIndex[i];
    const xml = Buffer.from(file.content as Uint8Array).toString("utf8");
    const topLeft = `${columnLetter(pane.xSplit)}${pane.ySplit + 1}`;
    // Rows-only freeze (no columns) is a "bottomLeft" pane without xSplit in Excel's XML.
    const active = pane.xSplit > 0 ? "bottomRight" : "bottomLeft";
    const xSplit = pane.xSplit > 0 ? `xSplit="${pane.xSplit}" ` : "";
    const paneXml =
      `<pane ${xSplit}ySplit="${pane.ySplit}" topLeftCell="${topLeft}" ` +
      `activePane="${active}" state="frozen"/><selection pane="${active}"/>`;
    const content = Buffer.from(
      xml.replace(/<sheetView([^>]*)\/>/, `<sheetView$1>${paneXml}</sheetView>`),
      "utf8",
    );
    file.content = content;
    file.size = content.length;
  });
  return Buffer.from(XLSX.CFB.write(zip, { fileType: "zip", type: "buffer", compression: true }) as Uint8Array);
}

/** Price Budgeted Revenue uses: a range ("7,600 – 7,950") → lowest (BUDGET_REVENUE_PRICE). */
export function revenuePriceOf(cell: Cell): number | null {
  if (typeof cell === "number") return cell;
  const prices = cell
    .split("–")
    .map((part) => Number(part.replace(/,/g, "").trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return null;
  return BUDGET_REVENUE_PRICE === "max" ? Math.max(...prices) : Math.min(...prices);
}

/** SUMMARY sheet name (first sheet). */
export const SUMMARY_SHEET = "SUMMARY";

/** Flat sheet for pivot tables, after the wide sheets. */
const DUMP_SHEET = "DUMP";
const DUMP_TABLE = "SalesBudgetData";
const DUMP_HEADERS = [
  "Channel",
  "Merchant / Location",
  "Common SKU",
  "Brand",
  "VAT",
  "Priority",
  "Selling Price",
  "Compare at Price",
  "Current Stock",
  "Current ROP",
  "Highest Sale Qty",
  "Target %",
  "Budgeted Qty",
  "Budgeted Revenue",
] as const;
const DUMP_MONEY = new Set(["Selling Price", "Compare at Price", "Budgeted Revenue"]);

type DumpValue = string | number | null;

/**
 * DUMP: one row per sheet × merchant / shop × item line, straight from the wide sheets' values
 * (nothing recalculated). Values kept once per item (online sheets' stock / ROP / Highest Sale
 * Qty) repeat on every merchant's row. Numbers stay numbers: a price range becomes its lowest
 * price (the one Budgeted Revenue uses); a blank Budgeted Qty / Revenue becomes 0 so sums work.
 */
function buildDumpRows(sections: SalesBudgetExportSection[]): DumpValue[][] {
  const rows: DumpValue[][] = [];
  const num = (cell: Cell | undefined) => (typeof cell === "number" ? cell : null);
  const price = (cell: Cell | undefined) => (cell == null || cell === "" ? null : revenuePriceOf(cell));
  for (const section of sections) {
    const fixed = (h: string) => section.fixedHeaders.indexOf(h);
    const metric = (h: string) => section.metricHeaders.indexOf(h);
    section.entities.forEach((entity, i) => {
      for (const line of section.rows) {
        const block = line.metrics[i];
        const value = (h: string) =>
          metric(h) === -1 ? line.fixed[fixed(h)] : (block?.[metric(h)] ?? "");
        const text = (h: string) => {
          const v = line.fixed[fixed(h)];
          return v == null || v === "" ? null : String(v);
        };
        rows.push([
          section.sheetName,
          entity,
          text("Common SKU"),
          text("Brand"),
          text("VAT"),
          text("Priority"),
          price(line.fixed[fixed("Selling Price")]),
          price(line.fixed[fixed("Compare at Price")]),
          num(value("Current Stock")),
          num(value("Current ROP")),
          num(value("Highest Sale Qty")),
          num(value("Target %")),
          num(value("Budgeted Qty")) ?? 0,
          num(value("Budgeted Revenue")) ?? 0,
        ]);
      }
    });
  }
  return rows;
}

/** Plain header + data (the Excel Table styles it); money columns get thousands separators. */
function buildDumpSheet(rows: DumpValue[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([[...DUMP_HEADERS], ...rows]);
  DUMP_HEADERS.forEach((header, c) => {
    if (!DUMP_MONEY.has(header)) return;
    for (let r = 1; r <= rows.length; r += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") {
        cell.z = MONEY_FORMAT;
        cell.s = { numFmt: MONEY_FORMAT };
      }
    }
  });
  sheet["!cols"] = DUMP_HEADERS.map((h) =>
    h === "Merchant / Location" ? { wch: 22 } : h === "Brand" ? { wch: 18 } : { wch: 14 },
  );
  return sheet;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Makes the DUMP data an Excel Table (named range with header filters, refreshes cleanly in
 * pivot tables). SheetJS 0.18 can't write tables, so add the table part to the zip directly.
 */
function addExcelTable(buffer: Buffer, sheetNumber: number, rowCount: number): Buffer {
  const zip = XLSX.CFB.read(buffer, { type: "buffer" });
  const fileAt = (suffix: string) => {
    const i = zip.FullPaths.findIndex((p: string) => p.endsWith(suffix));
    return i === -1 ? null : zip.FileIndex[i];
  };
  const setText = (file: { content: unknown; size: number }, text: string) => {
    const content = Buffer.from(text, "utf8");
    file.content = content;
    file.size = content.length;
  };
  const ref = `A1:${columnLetter(DUMP_HEADERS.length - 1)}${rowCount + 1}`;

  const sheet = fileAt(`xl/worksheets/sheet${sheetNumber}.xml`);
  const types = fileAt("[Content_Types].xml");
  if (!sheet || !types) return buffer;
  const sheetXml = Buffer.from(sheet.content as Uint8Array).toString("utf8");
  setText(
    sheet,
    sheetXml.replace(
      "</worksheet>",
      `<tableParts count="1"><tablePart r:id="rIdTable1"/></tableParts></worksheet>`,
    ),
  );
  const typesXml = Buffer.from(types.content as Uint8Array).toString("utf8");
  setText(
    types,
    typesXml.replace(
      "</Types>",
      `<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>`,
    ),
  );
  XLSX.CFB.utils.cfb_add(
    zip,
    `xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`,
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rIdTable1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/>` +
        `</Relationships>`,
      "utf8",
    ),
  );
  XLSX.CFB.utils.cfb_add(
    zip,
    "xl/tables/table1.xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="${DUMP_TABLE}" displayName="${DUMP_TABLE}" ref="${ref}" totalsRowShown="0">` +
        `<autoFilter ref="${ref}"/>` +
        `<tableColumns count="${DUMP_HEADERS.length}">` +
        DUMP_HEADERS.map((h, i) => `<tableColumn id="${i + 1}" name="${xmlEscape(h)}"/>`).join("") +
        `</tableColumns>` +
        `<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>` +
        `</table>`,
      "utf8",
    ),
  );
  return Buffer.from(XLSX.CFB.write(zip, { fileType: "zip", type: "buffer", compression: true }) as Uint8Array);
}

/**
 * Writes the workbook: SUMMARY (targets + Budgeted Revenue totals) first, then the wide
 * (per merchant / per shop) sheets, then DUMP (flat, for pivot tables). Used by the Export and
 * by saved-budget downloads; DUMP is built from the same sections, so it always matches.
 */
export function writeSalesBudgetWorkbook(sections: SalesBudgetExportSection[]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(sections), SUMMARY_SHEET);
  for (const section of sections) {
    XLSX.utils.book_append_sheet(workbook, buildSheet(section), section.sheetName);
  }
  const dumpRows = buildDumpRows(sections);
  XLSX.utils.book_append_sheet(workbook, buildDumpSheet(dumpRows), DUMP_SHEET);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  // SUMMARY / DUMP: header row frozen. Data sheets: header rows + the Common SKU column.
  const frozen = applyFreezePanes(buffer, [
    { xSplit: 0, ySplit: 1 },
    ...sections.map((section) => ({ xSplit: freezeColumns(section), ySplit: FREEZE_ROWS })),
    { xSplit: 0, ySplit: 1 },
  ]);
  return addExcelTable(frozen, sections.length + 2, dumpRows.length);
}

/** A zip (deflate) of the given files, at the zip's root. */
export function zipFiles(files: Array<{ name: string; content: Buffer }>): Buffer {
  const zip = XLSX.CFB.utils.cfb_new();
  for (const file of files) XLSX.CFB.utils.cfb_add(zip, file.name, file.content);
  return Buffer.from(
    XLSX.CFB.write(zip, { fileType: "zip", type: "buffer", compression: true }) as Uint8Array,
  );
}
