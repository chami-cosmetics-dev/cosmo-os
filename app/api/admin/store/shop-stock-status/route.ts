import { NextRequest, NextResponse } from "next/server";

import { hasPermission, requireUserContext } from "@/lib/rbac";
import { loadShopStockStatus } from "@/lib/shop-stock-status/load";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

/** `?refresh=1` regenerates the ERP stock report (shared with Stock Health). */
export async function GET(request: NextRequest) {
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
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    return NextResponse.json(await loadShopStockStatus(companyId, { refresh }));
  } catch (error) {
    console.error("Shop Stock Status failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Shop Stock Status" },
      { status: 502 },
    );
  }
}
