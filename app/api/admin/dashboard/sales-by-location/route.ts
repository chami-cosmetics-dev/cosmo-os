import { NextRequest, NextResponse } from "next/server";

import {
  fetchDashboardSalesByLocationGateway,
  fetchDashboardSalesByLocationMerchant,
} from "@/lib/page-data/dashboard-sales";
import { createPerfLogger } from "@/lib/perf";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { dashboardSalesQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const perf = createPerfLogger("api.admin.dashboard.sales-by-location.GET", {
    path: request.nextUrl.pathname,
  });
  const auth = await requirePermission("orders.read");
  perf.mark("auth");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  perf.mark("load-company");

  const companyId = user?.companyId ?? null;
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
    date_type: searchParams.get("date_type") ?? undefined,
    analysis_type: searchParams.get("analysis_type") ?? undefined,
  });

  if (!parsed.success) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { from, to, date_type: dateType, analysis_type: analysisType } = parsed.data;

  if (analysisType === "gateway") {
    const result = await fetchDashboardSalesByLocationGateway(companyId, {
      fromYmd: from,
      toYmd: to,
      dateType,
    });
    perf.mark("query");
    if (result.invalidRange) {
      perf.end({ status: 400, ok: false, analysisType });
      return NextResponse.json({ error: "From date must be on or before To date" }, { status: 400 });
    }
    perf.end({ status: 200, ok: true, analysisType, locationCount: result.locations.length });
    return NextResponse.json({
      locations: result.locations,
      analysisType: "gateway" as const,
    });
  }

  const result = await fetchDashboardSalesByLocationMerchant(companyId, {
    fromYmd: from,
    toYmd: to,
    dateType,
  });
  perf.mark("query");

  if (result.invalidRange) {
    perf.end({ status: 400, ok: false, analysisType });
    return NextResponse.json({ error: "From date must be on or before To date" }, { status: 400 });
  }

  perf.end({ status: 200, ok: true, analysisType, locationCount: result.locations.length });
  return NextResponse.json({
    locations: result.locations,
    analysisType: "merchant" as const,
  });
}
