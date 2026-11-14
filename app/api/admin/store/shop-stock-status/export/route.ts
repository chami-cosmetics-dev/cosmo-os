import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { hasPermission, requireUserContext } from "@/lib/rbac";
import { SHOP_STOCK_TAB_COLUMNS } from "@/lib/shop-stock-status/config";
import { loadShopStockStatus } from "@/lib/shop-stock-status/load";
import { addLocationSheet } from "@/lib/shop-stock-status/workbook";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

/** Shop Stock Status (live ERP figures, same cache as the screen): SHOP and ONLINE sheets. */
export async function GET() {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, "store.shop_stock_status.read")) {
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
    const { tabs, fetchedAt } = await loadShopStockStatus(companyId);
    const downloadedAt = formatAppIsoDateTime(new Date());
    // The stock can be up to an hour older than the download (shared ERP cache).
    const times = { downloadedAt, stockAsOf: formatAppIsoDateTime(new Date(fetchedAt)) };

    const wb = new ExcelJS.Workbook();
    addLocationSheet(wb, "SHOP", tabs.shops, SHOP_STOCK_TAB_COLUMNS.shops, times);
    addLocationSheet(wb, "ONLINE", tabs.online, SHOP_STOCK_TAB_COLUMNS.online, times);

    const buffer = await wb.xlsx.writeBuffer();
    // e.g. shop-stock-status-2026-11-10_11-18.xlsx (no ":" — not allowed in file names).
    const stamp = downloadedAt.slice(0, 16).replace(" ", "_").replace(":", "-");
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="shop-stock-status-${stamp}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Shop Stock Status export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build export" },
      { status: 502 },
    );
  }
}
