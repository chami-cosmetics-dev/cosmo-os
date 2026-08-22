import { NextRequest, NextResponse } from "next/server";

import { getDashboardDateTypePermission } from "@/lib/dashboard-date-type-permissions";
import { fetchCosmeticsLkDrilldown } from "@/lib/page-data/dashboard-cosmetics-lk-drilldown";
import { createPerfLogger } from "@/lib/perf";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cosmeticsLkDrilldownQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const perf = createPerfLogger("api.admin.dashboard.cosmetics-lk-drilldown.GET", {
    path: request.nextUrl.pathname,
  });
  const auth = await requirePermission("dashboard.view");
  perf.mark("auth");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json(
      { error: auth.error },
      {
        status: auth.status,
        headers: { "Server-Timing": perf.toServerTimingHeader() },
      },
    );
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    perf.end({ status: 404, ok: false });
    return NextResponse.json(
      { error: "No company associated with your account" },
      {
        status: 404,
        headers: { "Server-Timing": perf.toServerTimingHeader() },
      },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = cosmeticsLkDrilldownQuerySchema.safeParse({
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    date_type: searchParams.get("date_type") ?? undefined,
  });

  if (!parsed.success) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      {
        status: 400,
        headers: { "Server-Timing": perf.toServerTimingHeader() },
      },
    );
  }

  const { from, to, date_type: dateType } = parsed.data;
  if (!hasPermission(auth.context, getDashboardDateTypePermission(dateType))) {
    perf.end({ status: 403, ok: false, dateType });
    return NextResponse.json(
      { error: "Permission denied for this dashboard date type" },
      {
        status: 403,
        headers: { "Server-Timing": perf.toServerTimingHeader() },
      },
    );
  }

  const result = await fetchCosmeticsLkDrilldown(companyId, {
    fromYmd: from,
    toYmd: to,
    dateType,
  });
  perf.mark("query");

  if (!result.ok) {
    if (result.reason === "invalid_range") {
      perf.end({ status: 400, ok: false });
      return NextResponse.json(
        { error: "From date must be on or before To date" },
        {
          status: 400,
          headers: { "Server-Timing": perf.toServerTimingHeader() },
        },
      );
    }
    perf.end({ status: 404, ok: false });
    return NextResponse.json(
      { error: "Cosmetics.lk location not found" },
      {
        status: 404,
        headers: { "Server-Timing": perf.toServerTimingHeader() },
      },
    );
  }

  perf.end({
    status: 200,
    ok: true,
    dateType,
    merchantCount: result.data.merchants.length,
  });
  return NextResponse.json(result.data, {
    headers: { "Server-Timing": perf.toServerTimingHeader() },
  });
}
