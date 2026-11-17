import { NextResponse } from "next/server";

import { hasPermission, requireUserContext } from "@/lib/rbac";
import { buildRopStatusWorkbook, XLSX_CONTENT_TYPE } from "@/lib/stock-health/export-workbooks";
import { loadStockHealthRopData } from "@/lib/stock-health/rop-status";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

/**
 * ROP Status breakdown (live ERP figures, same cache as the screen). The same workbook is
 * attached to the Monday Stock Availability Status mail.
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
    const { fileName, buffer } = buildRopStatusWorkbook(await loadStockHealthRopData(companyId));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${fileName}"`,
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
