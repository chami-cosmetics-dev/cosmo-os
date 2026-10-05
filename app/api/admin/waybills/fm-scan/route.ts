import { NextRequest, NextResponse } from "next/server";

import { exportCitypakFmScan } from "@/lib/citypak-fm-scan-export";
import { requireAnyPermission } from "@/lib/rbac";
import { waybillFmScanExportQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([
    "fulfillment.waybill_lookup.read",
    "fulfillment.waybill_lookup.import",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = waybillFmScanExportQuerySchema.safeParse({
    from: request.nextUrl.searchParams.get("from") ?? "",
    to: request.nextUrl.searchParams.get("to") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a from and to date (YYYY-MM-DD)." }, { status: 400 });
  }

  const result = await exportCitypakFmScan({
    companyId,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return new NextResponse(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "X-Export-Rows": String(result.rowCount),
    },
  });
}
