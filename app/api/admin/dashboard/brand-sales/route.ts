import { NextRequest, NextResponse } from "next/server";

import { fetchDashboardBrandSales } from "@/lib/page-data/dashboard-brand-sales";
import { createPerfLogger } from "@/lib/perf";
import { requirePermission } from "@/lib/rbac";
import { dashboardBrandSalesQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const perf = createPerfLogger("api.admin.dashboard.brand-sales.GET", {
    path: request.nextUrl.pathname,
  });

  const auth = await requirePermission("orders.read");
  perf.mark("auth");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    perf.end({ status: 404, ok: false });
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = dashboardBrandSalesQuerySchema.safeParse({
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    date_type: searchParams.get("date_type") ?? undefined,
    location_id: searchParams.get("location_id") ?? undefined,
  });

  if (!parsed.success) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await fetchDashboardBrandSales(companyId, {
    fromYmd: parsed.data.from,
    toYmd: parsed.data.to,
    dateType: parsed.data.date_type,
    locationId: parsed.data.location_id,
  });

  perf.end({ status: 200, ok: true });
  return NextResponse.json(result, {
    headers: { "Server-Timing": perf.toServerTimingHeader() },
  });
}
