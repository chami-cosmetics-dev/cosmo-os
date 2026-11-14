import { NextResponse } from "next/server";

import { hasPermission, requireUserContext } from "@/lib/rbac";
import { loadStockHealthOutOfStock } from "@/lib/stock-health/rop-status";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

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
    return NextResponse.json(await loadStockHealthOutOfStock(companyId));
  } catch (error) {
    console.error("Stock Health out of stock failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load out-of-stock items" },
      { status: 502 },
    );
  }
}
