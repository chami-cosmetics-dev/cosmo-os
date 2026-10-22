import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { STOCK_REQUEST_EXPORT_HEADERS, stockRequestExportRow } from "@/lib/wishlist-buddy/export";
import { exportStockRequests } from "@/lib/wishlist-buddy/requests";
import { requireStockRequestViewer, stockRequestErrorResponse } from "@/lib/wishlist-buddy/route-auth";
import {
  stockRequestExportScopeSchema,
  stockRequestListQuerySchema,
} from "@/lib/wishlist-buddy/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireStockRequestViewer(["stock_requests.manage"]);
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const scope = stockRequestExportScopeSchema.safeParse(sp.get("scope") || undefined);
  if (!scope.success) {
    return NextResponse.json({ error: "Invalid tab" }, { status: 400 });
  }
  const parsed = stockRequestListQuerySchema.safeParse({
    status: sp.get("status") || undefined,
    stock: sp.get("stock") || undefined,
    search: sp.get("search") || undefined,
    createdBy: sp.get("createdBy") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }

  try {
    const items = await exportStockRequests({
      companyId: auth.companyId,
      viewer: auth.viewer,
      scope: scope.data,
      status: parsed.data.status,
      stock: parsed.data.stock,
      search: parsed.data.search,
      createdById: scope.data === "staff" ? parsed.data.createdBy : undefined,
    });
    const sheetRows = items.map(stockRequestExportRow);
    const workbook = XLSX.utils.book_new();
    const sheet =
      sheetRows.length > 0
        ? XLSX.utils.json_to_sheet(sheetRows)
        : XLSX.utils.aoa_to_sheet([[...STOCK_REQUEST_EXPORT_HEADERS]]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Requests");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const today = new Date().toISOString().slice(0, 10);
    const statusPart = parsed.data.status ?? "all";
    const filename = `stock-requests-${scope.data}-${statusPart}-${today}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return stockRequestErrorResponse(error);
  }
}
