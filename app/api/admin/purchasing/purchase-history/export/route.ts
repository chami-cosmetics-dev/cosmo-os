import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { purchaseHistoryExportSheetRows } from "@/lib/vault-osf/purchase-history-dashboard";
import { loadPurchaseHistory } from "@/lib/vault-osf/purchase-history-load";
import { purchaseHistoryQuerySchema } from "@/lib/validation/osf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(context, "purchasing.purchase_history.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = purchaseHistoryQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const query = parsed.data;
  if (query.from > query.to) {
    return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
  }

  const loaded = await loadPurchaseHistory(companyId, query);
  const sheetRows = purchaseHistoryExportSheetRows(loaded.rows);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Purchase History");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `purchase-history-${query.from}-to-${query.to}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
