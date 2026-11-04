import { NextRequest, NextResponse } from "next/server";

import { getDashboardDateTypePermission } from "@/lib/dashboard-date-type-permissions";
import { buildCouponReportWorkbook } from "@/lib/page-data/dashboard-coupon-report-export";
import { fetchDashboardCouponReport } from "@/lib/page-data/dashboard-coupon-report";
import { createPerfLogger } from "@/lib/perf";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cosmeticsLkDrilldownQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const perf = createPerfLogger("api.admin.dashboard.coupon-report.export.GET", {
    path: request.nextUrl.pathname,
  });
  const auth = await requirePermission("dashboard.view");
  perf.mark("auth");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    perf.end({ status: 404, ok: false });
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = cosmeticsLkDrilldownQuerySchema.safeParse({
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    date_type: searchParams.get("date_type") ?? undefined,
    coupon_code: searchParams.getAll("coupon_code"),
  });
  if (!parsed.success) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { from, to, date_type: dateType, coupon_code: couponCodes } = parsed.data;
  if (!hasPermission(auth.context, getDashboardDateTypePermission(dateType))) {
    perf.end({ status: 403, ok: false, dateType });
    return NextResponse.json(
      { error: "Permission denied for this dashboard date type" },
      { status: 403 },
    );
  }

  const report = await fetchDashboardCouponReport(companyId, {
    fromYmd: from,
    toYmd: to,
    dateType,
    couponCodes,
  });
  perf.mark("query");
  if (report.invalidRange) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json(
      { error: "From date must be on or before To date" },
      { status: 400 },
    );
  }

  const { buffer, filename } = buildCouponReportWorkbook(report);
  perf.end({ status: 200, ok: true, rowCount: report.rows.length });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Server-Timing": perf.toServerTimingHeader(),
    },
  });
}
