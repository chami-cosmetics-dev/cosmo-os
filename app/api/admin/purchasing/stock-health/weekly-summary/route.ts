import { NextRequest, NextResponse } from "next/server";

import { hasPermission, requireUserContext } from "@/lib/rbac";
import { loadStockHealthWeeklySummary } from "@/lib/stock-health/weekly-summary";

export const dynamic = "force-dynamic";
/** Live figures regenerate the ERP stock report (Prepared Report), same budget as Sales Budget. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
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
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    return NextResponse.json(await loadStockHealthWeeklySummary(companyId, { refresh }));
  } catch (error) {
    console.error("Stock Health weekly summary failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load weekly summary" },
      { status: 502 },
    );
  }
}
