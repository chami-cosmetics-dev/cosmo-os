import { NextRequest, NextResponse } from "next/server";

import { hasPermission, requireUserContext } from "@/lib/rbac";
import { buildRopDetailsWorkbook, XLSX_CONTENT_TYPE } from "@/lib/stock-health/export-workbooks";
import {
  applyRopDetailsFilters,
  parseRopDetailsFilters,
  ropDetailsFilterText,
} from "@/lib/stock-health/rop-details";
import { loadStockHealthRopDetails } from "@/lib/stock-health/rop-status";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

/**
 * ROP Details, filtered: the screen's filters are re-applied here to the same data (same
 * cache), so the file lists exactly the rows on the screen, in the same order.
 */
export async function POST(request: NextRequest) {
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
    const filters = parseRopDetailsFilters(await request.json().catch(() => ({})));
    const details = await loadStockHealthRopDetails(companyId);
    const { fileName, buffer } = buildRopDetailsWorkbook(
      applyRopDetailsFilters(details.rows, filters),
      ropDetailsFilterText(filters),
      new Date(details.fetchedAt),
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Stock Health ROP details export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build export" },
      { status: 502 },
    );
  }
}
