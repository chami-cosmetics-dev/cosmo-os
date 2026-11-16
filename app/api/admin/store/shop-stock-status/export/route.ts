import { NextResponse } from "next/server";

import { hasPermission, requireUserContext } from "@/lib/rbac";
import { loadShopStockStatus } from "@/lib/shop-stock-status/load";
import { buildShopStockStatusWorkbook } from "@/lib/shop-stock-status/workbook";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

/**
 * Shop Stock Status (live ERP figures, same cache as the screen): SHOP and ONLINE sheets.
 * The same file is attached to the Monday Stock Availability Status mail.
 */
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
    const { fileName, buffer } = await buildShopStockStatusWorkbook(await loadShopStockStatus(companyId));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
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
