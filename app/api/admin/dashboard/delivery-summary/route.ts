import { NextRequest, NextResponse } from "next/server";

import { fetchDashboardDeliverySummary } from "@/lib/page-data/dashboard-delivery-summary";
import { createPerfLogger } from "@/lib/perf";
import { requirePermission } from "@/lib/rbac";
import { dashboardSalesQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const perf = createPerfLogger("api.admin.dashboard.delivery-summary.GET", {
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
  const parsed = dashboardSalesQuerySchema.safeParse({
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  });

  if (!parsed.success) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await fetchDashboardDeliverySummary(companyId, parsed.data.from, parsed.data.to);

  perf.end({ status: 200, ok: true });
  return NextResponse.json(result, { status: 200 });
}
