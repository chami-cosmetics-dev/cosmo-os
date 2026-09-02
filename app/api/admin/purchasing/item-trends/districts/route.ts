import { NextRequest, NextResponse } from "next/server";

import { resolveItemTrendWindows } from "@/lib/item-trends/aggregate";
import {
  fetchDistrictItems,
  fetchDistrictLeaderboard,
  fetchExpansionOpportunities,
} from "@/lib/item-trends/district";
import { resolveItemTrendsScope } from "@/lib/item-trends/scope";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { itemTrendsDistrictsQuerySchema } from "@/lib/validation";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.item_trends.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const scope = await resolveItemTrendsScope(context);
  if (!scope.companyWide) {
    return NextResponse.json(
      { error: "District analytics require company-wide access" },
      { status: 403 },
    );
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = itemTrendsDistrictsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { from, to, compareFrom, compareTo, district, sortBy, includeAreaGrowth } = parsed.data;

  try {
    const { current, prior } = resolveItemTrendWindows({
      fromYmd: from,
      toYmd: to,
      compareFromYmd: compareFrom,
      compareToYmd: compareTo,
    });

    const districts = await fetchDistrictLeaderboard(companyId, current, prior, sortBy);

    const [items, expansion] = await Promise.all([
      district?.trim()
        ? fetchDistrictItems(companyId, district.trim(), current, prior, 50)
        : Promise.resolve([]),
      includeAreaGrowth
        ? fetchExpansionOpportunities(companyId, current, prior, districts)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      districts,
      items,
      expansion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load districts";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
