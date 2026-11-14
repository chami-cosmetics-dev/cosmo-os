import { NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";

import { formatAppIsoDate, formatAppIsoDateTime } from "@/lib/format-datetime";
import { hasPermission, requireUserContext } from "@/lib/rbac";
import {
  buildCommonSkuRows,
  commonSkuOf,
  skuKey,
  stockHealthSkipReason,
  stockHealthStatusOf,
  summarizeByStatus,
} from "@/lib/stock-health/calc";
import { STOCK_HEALTH_STATUSES } from "@/lib/stock-health/config";
import { getLiveStockHealthData, loadExcludedSkus } from "@/lib/stock-health/weekly-summary";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

function sheet(rows: Record<string, string | number>[], widths: number[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

/**
 * Weekly Summary breakdown (live ERP figures, same cache as the screen): Summary,
 * one row per Common SKU, and one row per ERP SKU with why it is or isn't counted.
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
    const [{ items, stockBySku, fetchedAt }, excluded] = await Promise.all([
      getLiveStockHealthData(companyId),
      loadExcludedSkus(companyId),
    ]);
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
      sheet(
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
      sheet(
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
      sheet(
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

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock-health-breakdown-${formatAppIsoDate(fetchedAt)}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Stock Health breakdown export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build breakdown" },
      { status: 502 },
    );
  }
}
