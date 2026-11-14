import { NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";

import { formatAppIsoDate, formatAppIsoDateTime } from "@/lib/format-datetime";
import { hasPermission, requireUserContext } from "@/lib/rbac";
import {
  commonSkuOf,
  isZeroStock,
  skuKey,
  stockHealthSkipReason,
  summarizeRopStatus,
  type StockHealthRopGroup,
} from "@/lib/stock-health/calc";
import {
  STOCK_HEALTH_ROP_ROW_ORDER,
  type StockHealthRopCounts,
} from "@/lib/stock-health/config";
import { currentMonthName, loadStockHealthRopData } from "@/lib/stock-health/rop-status";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

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
function sheet(rows: Array<Array<string | number | null>>, widths: number[], percentColumns: number[] = []) {
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

function summaryRow(label: string, c: StockHealthRopCounts) {
  return [
    label,
    ...GROUP_ORDER.flatMap((group) => [c[group], share(c[group], c.total)]),
    c.total,
    c.zeroStock, share(c.zeroStock, c.total),
  ];
}

/**
 * ROP Status breakdown (live ERP figures, same cache as the screen): the table, one row per
 * Common SKU (stock, ROP, group), and one row per ERP SKU.
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
    const { items, stockBySku, ropBySku, excluded, ropRows, fetchedAt } =
      await loadStockHealthRopData(companyId);
    const { rows, grandTotal } = summarizeRopStatus(ropRows);
    const statusByCommonSku = new Map(ropRows.map((row) => [row.commonSku, row.status]));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      sheet(
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
          ...rows.map((row) => summaryRow(row.status, row)),
          summaryRow("Grand Total", grandTotal),
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
      sheet(
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
      sheet(
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

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock-health-rop-status-${formatAppIsoDate(fetchedAt)}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Stock Health ROP status export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build breakdown" },
      { status: 502 },
    );
  }
}
