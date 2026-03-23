import { NextRequest, NextResponse } from "next/server";

import {
  fetchDashboardSalesByLocationGateway,
  fetchDashboardSalesByLocationMerchant,
} from "@/lib/page-data/dashboard-sales";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { dashboardSalesQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const companyId = user?.companyId ?? null;
  if (!companyId) {
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
    if (result.invalidRange) {
      return NextResponse.json({ error: "From date must be on or before To date" }, { status: 400 });
    }
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

  if (result.invalidRange) {
    return NextResponse.json({ error: "From date must be on or before To date" }, { status: 400 });
  }

  return NextResponse.json({
    locations: result.locations,
    analysisType: "merchant" as const,
  });
}
