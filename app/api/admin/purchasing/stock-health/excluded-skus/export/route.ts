import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { hasPermission, requireUserContext } from "@/lib/rbac";
import {
  commonSkuOf,
  excludedSkuPrefixOf,
  excludingRuleOf,
  parseExcludedSkus,
  skuKey,
  stockHealthSkipReason,
} from "@/lib/stock-health/calc";
import { loadStockHealthRopData } from "@/lib/stock-health/rop-status";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

/** Rows 1–3: title, downloaded, stock as of; row 4 blank; row 5 headers. */
const HEADER_ROW = 5;

/** A sheet with the title + time lines, a frozen navy header row, then the rows. */
function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  title: string,
  times: { downloadedAt: string; stockAsOf: string },
  columns: Array<{ header: string; width: number }>,
  rows: Array<Array<string | number>>,
) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 0, ySplit: HEADER_ROW }] });
  ws.columns = columns.map((c) => ({ width: c.width }));
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(2, 1).value = `Downloaded: ${times.downloadedAt}`;
  ws.getCell(3, 1).value = `Live ERP stock as of: ${times.stockAsOf}`;
  for (const r of [2, 3]) ws.getCell(r, 1).font = { italic: true };

  columns.forEach((column, i) => {
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = column.header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  rows.forEach((row, i) => {
    ws.getRow(HEADER_ROW + 1 + i).values = row;
  });
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: columns.length } };
}

/**
 * What Stock Health leaves out: the Excluded SKUs list as entered, and every ERP variant
 * not counted (excluded SKU / rule, or website draft with no stock) with its stock and ROP.
 */
export async function GET() {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, "purchasing.stock_health.read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  try {
    const [{ items, stockBySku, ropBySku, excluded, fetchedAt }, listRows] = await Promise.all([
      loadStockHealthRopData(companyId),
      prisma.stockHealthExcludedSku.findMany({
        where: { companyId },
        orderBy: { sku: "asc" },
        select: { sku: true, countAnyway: true, createdAt: true },
      }),
    ]);
    const downloadedAt = formatAppIsoDateTime(new Date());
    // The stock can be up to an hour older than the download (shared ERP cache).
    const times = { downloadedAt, stockAsOf: formatAppIsoDateTime(fetchedAt) };
    const allEntries = parseExcludedSkus(listRows.map((row) => row.sku));

    const wb = new ExcelJS.Workbook();
    addSheet(
      wb,
      "Excluded list",
      "Stock Health — Excluded SKUs list",
      times,
      [
        { header: "Entry", width: 30 },
        { header: "Type", width: 26 },
        { header: "Covered by rule", width: 16 },
        { header: "Added on", width: 20 },
      ],
      listRows.map((row) => {
        const isRule = excludedSkuPrefixOf(row.sku) !== null;
        return [
          row.sku,
          isRule
            ? "Rule (starts with)"
            : row.countAnyway
              ? "Counted anyway (exception)"
              : "Excluded SKU",
          isRule ? "" : (excludingRuleOf(row.sku, allEntries) ?? ""),
          formatAppIsoDateTime(row.createdAt),
        ];
      }),
    );

    const left = items
      .map((item) => ({
        item,
        reason: stockHealthSkipReason(item, excluded, stockBySku.get(skuKey(item.sku)) ?? 0),
      }))
      .filter((x): x is { item: (typeof items)[number]; reason: string } => x.reason !== null)
      .sort((a, b) => a.reason.localeCompare(b.reason) || a.item.sku.localeCompare(b.item.sku));
    addSheet(
      wb,
      "Excluded items",
      "Stock Health — ERP items left out",
      times,
      [
        { header: "SKU", width: 26 },
        { header: "Common SKU", width: 22 },
        { header: "Item name", width: 44 },
        { header: "Brand", width: 20 },
        { header: "ERP Priority", width: 14 },
        { header: "Website Status", width: 16 },
        { header: "Current Stock", width: 13 },
        { header: "ROP", width: 9 },
        { header: "Reason", width: 18 },
        { header: "Rule", width: 10 },
      ],
      left.map(({ item, reason }) => {
        const common = commonSkuOf(item);
        return [
          item.sku,
          common,
          item.itemName ?? "",
          item.brand ?? "",
          item.priority ?? "",
          item.siteStatus ?? "Not on website",
          stockBySku.get(skuKey(item.sku)) ?? 0,
          ropBySku.get(skuKey(item.sku)) ?? 0,
          reason,
          reason === "Excluded SKU" && !excluded.exact.has(common) ? (excludingRuleOf(common, excluded) ?? "") : "",
        ];
      }),
    );

    const buffer = await wb.xlsx.writeBuffer();
    // e.g. stock-health-excluded-2026-11-11_14-05.xlsx (no ":" — not allowed in file names).
    const stamp = downloadedAt.slice(0, 16).replace(" ", "_").replace(":", "-");
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock-health-excluded-${stamp}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Stock Health excluded export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build export" },
      { status: 502 },
    );
  }
}
