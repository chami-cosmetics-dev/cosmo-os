import "server-only";

import * as XLSX from "xlsx-js-style";

import { formatAppIsoDate, formatAppIsoDateTime } from "@/lib/format-datetime";
import {
  buildCommonSkuRows,
  commonSkuOf,
  isZeroStock,
  skuKey,
  stockHealthSkipReason,
  stockHealthStatusOf,
  summarizeByStatus,
  summarizeRopStatus,
  type StockHealthRopGroup,
} from "@/lib/stock-health/calc";
import {
  STOCK_HEALTH_ROP_ROW_ORDER,
  STOCK_HEALTH_STATUSES,
  type StockHealthRopCounts,
} from "@/lib/stock-health/config";
import {
  ROP_DETAILS_STATUS_LABELS,
  type StockHealthRopDetailsRow,
} from "@/lib/stock-health/rop-details";
import { currentMonthName, type StockHealthRopData } from "@/lib/stock-health/rop-status";

/**
 * The Stock Health Excel files. The two breakdowns are shared by the screen's Export buttons and
 * the Monday / Tuesday summary mails (attached), so both always carry the same file; the ROP
 * Details file is the ROP Details tab's filtered export.
 */

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type StockHealthWorkbook = { fileName: string; buffer: Buffer };

type WeeklyBreakdownInput = Pick<StockHealthRopData, "items" | "stockBySku" | "excluded" | "fetchedAt">;

function jsonSheet(rows: Record<string, string | number>[], widths: number[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

/**
 * Weekly Summary breakdown: Summary, one row per Common SKU, and one row per ERP SKU with
 * why it is or isn't counted.
 */
export function buildWeeklySummaryWorkbook({
  items,
  stockBySku,
  excluded,
  fetchedAt,
}: WeeklyBreakdownInput): StockHealthWorkbook {
  const stockOf = (sku: string) => stockBySku.get(skuKey(sku)) ?? 0;
  const statusRank = (status: string) => STOCK_HEALTH_STATUSES.indexOf(status as never);

  const commonRows = buildCommonSkuRows(items, stockBySku, excluded).sort(
    (a, b) => statusRank(a.status) - statusRank(b.status) || a.commonSku.localeCompare(b.commonSku),
  );
  const statusByCommonSku = new Map(commonRows.map((row) => [row.commonSku, row.status]));
  const totals = summarizeByStatus(items, stockBySku, excluded);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    jsonSheet(
      [
        ...totals.map((t) => ({ "Priority Status": t.status, Count: t.count, "Current Stock": t.stock })),
        {
          "Priority Status": "Grand Total",
          Count: totals.reduce((s, t) => s + t.count, 0),
          "Current Stock": totals.reduce((s, t) => s + t.stock, 0),
        },
        { "Priority Status": "", Count: "", "Current Stock": "" },
        { "Priority Status": `Live ERP figures as of ${formatAppIsoDateTime(fetchedAt)}`, Count: "", "Current Stock": "" },
      ],
      [44, 10, 14],
    ),
    "Summary",
  );
  XLSX.utils.book_append_sheet(
    wb,
    jsonSheet(
      commonRows.map((row) => ({
        "Common SKU": row.commonSku,
        "Priority Status": row.status,
        Brand: row.variants.find((v) => v.brand)?.brand ?? "",
        Variants: row.variants.length,
        "Variant SKUs": row.variants.map((v) => v.sku).sort().join(", "),
        "Current Stock": row.stock,
      })),
      [24, 16, 22, 9, 50, 14],
    ),
    "Common SKUs",
  );
  XLSX.utils.book_append_sheet(
    wb,
    jsonSheet(
      [...items]
        .sort((a, b) => a.sku.localeCompare(b.sku))
        .map((item) => {
          const reason = stockHealthSkipReason(item, excluded, stockOf(item.sku));
          return {
            SKU: item.sku,
            "Common SKU": commonSkuOf(item),
            Brand: item.brand ?? "",
            "ERP Priority": item.priority ?? "",
            "Variant Status": stockHealthStatusOf(item.priority),
            "Common SKU Status": statusByCommonSku.get(commonSkuOf(item)) ?? "",
            "Website Status": item.siteStatus ?? "Not on website",
            "Current Stock": stockOf(item.sku),
            Counted: reason ? "No" : "Yes",
            Reason: reason ?? "",
          };
        }),
      [26, 24, 22, 14, 16, 18, 16, 14, 9, 18],
    ),
    "Variants",
  );

  return {
    fileName: `stock-health-breakdown-${formatAppIsoDate(fetchedAt)}.xlsx`,
    buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer,
  };
}

const GROUP_LABELS: Record<StockHealthRopGroup, string> = {
  fail: "FAIL",
  noRopNoStock: "No ROP - No Stock",
  noRopWithStock: "No ROP - With Stock",
  pass: "PASS",
};
/** Column / sort order, same as the screen. */
const GROUP_ORDER: StockHealthRopGroup[] = ["pass", "fail", "noRopWithStock", "noRopNoStock"];
const PERCENT_FORMAT = "0.0%";

/** Sheet from rows of cells; numbers in `percentColumns` are fractions shown as %. */
function aoaSheet(rows: Array<Array<string | number | null>>, widths: number[], percentColumns: number[] = []) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  for (let r = 1; r < rows.length; r += 1) {
    for (const c of percentColumns) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = PERCENT_FORMAT;
    }
  }
  return ws;
}

function share(count: number, total: number): number | null {
  return total > 0 ? count / total : null;
}

function ropSummaryRow(label: string, c: StockHealthRopCounts) {
  return [
    label,
    ...GROUP_ORDER.flatMap((group) => [c[group], share(c[group], c.total)]),
    c.total,
    c.zeroStock, share(c.zeroStock, c.total),
  ];
}

/**
 * ROP Status (Stock Availability Status) breakdown: the table, one row per Common SKU
 * (stock, ROP, group), and one row per ERP SKU.
 */
export function buildRopStatusWorkbook({
  items,
  stockBySku,
  ropBySku,
  excluded,
  ropRows,
  fetchedAt,
}: StockHealthRopData): StockHealthWorkbook {
  const { rows, grandTotal } = summarizeRopStatus(ropRows);
  const statusByCommonSku = new Map(ropRows.map((row) => [row.commonSku, row.status]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    aoaSheet(
      [
        [
          `Priority Status (${currentMonthName()})`,
          "PASS", "PASS %",
          "FAIL", "FAIL %",
          "No ROP - With Stock", "%",
          "No ROP - No Stock", "%",
          "Grand Total",
          "0' Stock", "0' Stock %",
        ],
        ...rows.map((row) => ropSummaryRow(row.status, row)),
        ropSummaryRow("Grand Total", grandTotal),
        [],
        [`Live ERP stock vs OSF ROP as of ${formatAppIsoDateTime(fetchedAt)}`],
        ["PASS = stock above 50% of ROP. 0' Stock (stock 0 or below) overlaps the groups and is not in the Grand Total."],
      ],
      [26, 8, 9, 8, 9, 20, 8, 18, 8, 12, 10, 12],
      [2, 4, 6, 8, 11],
    ),
    "Summary",
  );

  const rank = (status: string) => STOCK_HEALTH_ROP_ROW_ORDER.indexOf(status as never);
  XLSX.utils.book_append_sheet(
    wb,
    aoaSheet(
      [
        [
          "Common SKU", "Priority Status", "Brand", "Variants", "Variant SKUs",
          "Total Stock", "Total ROP", "Stock % of ROP", "ROP Group", "0' Stock",
        ],
        ...[...ropRows]
          .sort(
            (a, b) =>
              rank(a.status) - rank(b.status) ||
              GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
              a.commonSku.localeCompare(b.commonSku),
          )
          .map((row) => [
            row.commonSku,
            row.status,
            row.variants.find((v) => v.brand)?.brand ?? "",
            row.variants.length,
            row.variants.map((v) => v.sku).sort().join(", "),
            row.stock,
            row.rop,
            row.rop > 0 ? row.stock / row.rop : null,
            GROUP_LABELS[row.group],
            isZeroStock(row.stock) ? "Yes" : "No",
          ]),
      ],
      [24, 16, 22, 9, 44, 12, 11, 14, 20, 9],
      [7],
    ),
    "Common SKUs",
  );

  XLSX.utils.book_append_sheet(
    wb,
    aoaSheet(
      [
        ["SKU", "Common SKU", "Common SKU Status", "Website Status", "Current Stock", "ROP", "Counted", "Reason"],
        ...[...items]
          .sort((a, b) => a.sku.localeCompare(b.sku))
          .map((item) => {
            const reason = stockHealthSkipReason(item, excluded, stockBySku.get(skuKey(item.sku)) ?? 0);
            return [
              item.sku,
              commonSkuOf(item),
              statusByCommonSku.get(commonSkuOf(item)) ?? "",
              item.siteStatus ?? "Not on website",
              stockBySku.get(skuKey(item.sku)) ?? 0,
              ropBySku.get(skuKey(item.sku)) ?? 0,
              reason ? "No" : "Yes",
              reason ?? "",
            ];
          }),
      ],
      [26, 24, 18, 16, 14, 9, 9, 18],
    ),
    "Variants",
  );

  return {
    fileName: `stock-health-rop-status-${formatAppIsoDate(fetchedAt)}.xlsx`,
    buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer,
  };
}

/**
 * ROP Details tab, filtered: the rows as listed on the screen (same filters, same order).
 * Stock % of ROP is a fraction shown as %; "-" (no ROP) is left blank.
 */
export function buildRopDetailsWorkbook(
  rows: StockHealthRopDetailsRow[],
  filters: string,
  fetchedAt: Date,
): StockHealthWorkbook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    aoaSheet(
      [
        ["Common SKU", "Item name", "Priority Status", "Status", "Stock", "ROP", "Reorder Qty", "Stock % of ROP"],
        ...rows.map((row) => [
          row.commonSku,
          row.itemName ?? "",
          row.priority,
          ROP_DETAILS_STATUS_LABELS[row.status],
          row.stock,
          row.rop,
          row.reorderQty,
          row.percent == null ? null : row.percent / 100,
        ]),
        [],
        [`${rows.length} Common SKU${rows.length === 1 ? "" : "s"} · ${filters}`],
        [`Live ERP stock vs OSF ROP as of ${formatAppIsoDateTime(fetchedAt)}`],
      ],
      [24, 40, 16, 20, 12, 11, 13, 14],
      [7],
    ),
    "ROP Details",
  );
  return {
    fileName: `stock-health-rop-details-${formatAppIsoDate(fetchedAt)}.xlsx`,
    buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer,
  };
}
