import { NextRequest, NextResponse } from "next/server";

import {
  buildKpiSummary,
  calendarDaysInclusive,
  fetchMovementLeaderboard,
  fetchNewItemRows,
  fetchSkuWeekdayBuckets,
  fetchSlowdownRows,
  resolveItemTrendWindows,
} from "@/lib/item-trends/aggregate";
import { fetchDistrictLeaderboard, UNMAPPED_DISTRICT } from "@/lib/item-trends/district";
import {
  computeIntelligentSignals,
  mergeIntelligentMovement,
} from "@/lib/item-trends/intelligent";
import { buildPatternAnnotations } from "@/lib/item-trends/patterns";
import { resolveItemTrendsScope } from "@/lib/item-trends/scope";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { itemTrendsQuerySchema } from "@/lib/validation";

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

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = itemTrendsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { from, to, compareFrom, compareTo, priority } = parsed.data;

  try {
    const { current, prior } = resolveItemTrendWindows({
      fromYmd: from,
      toYmd: to,
      compareFromYmd: compareFrom,
      compareToYmd: compareTo,
    });

    const scope = await resolveItemTrendsScope(context);
    const priorityFilter = priority ?? "Top Priority";

    const locationFilter = scope.companyWide ? undefined : scope.locationId ?? undefined;

    const patternsAvailable = calendarDaysInclusive(from, to) >= 28;

    const [movement, newItems, slowdowns, districtLeaderboard, weekdayBuckets] =
      await Promise.all([
        fetchMovementLeaderboard(companyId, current, prior, {
          priority: priorityFilter,
          companyLocationId: locationFilter,
        }),
        fetchNewItemRows(companyId, current, prior),
        fetchSlowdownRows(companyId, current, prior),
        scope.companyWide
          ? fetchDistrictLeaderboard(companyId, current, prior, "units", priorityFilter)
          : Promise.resolve([]),
        patternsAvailable
          ? fetchSkuWeekdayBuckets(companyId, current)
          : Promise.resolve(new Map()),
      ]);

    const weeksInRange = Math.max(1, Math.floor(calendarDaysInclusive(from, to) / 7));
    const patterns = patternsAvailable
      ? buildPatternAnnotations(weekdayBuckets, weeksInRange, 20)
      : [];

    let intelligentEngine: "disabled" | "active" | "degraded" = "active";
    let intelligentSignals: ReturnType<typeof computeIntelligentSignals> = [];
    try {
      intelligentSignals = computeIntelligentSignals(movement, weekdayBuckets);
    } catch {
      intelligentEngine = "degraded";
    }

    const enrichedMovement =
      intelligentEngine === "active"
        ? mergeIntelligentMovement(movement, intelligentSignals)
        : movement;

    const kpis = buildKpiSummary({
      movement: enrichedMovement,
      newItems,
      slowdowns,
      topDistrict:
        districtLeaderboard.find((d) => d.district !== UNMAPPED_DISTRICT)?.district ?? null,
      patternHitCount: patterns.filter((p) => p.recurring).length,
    });

    return NextResponse.json({
      meta: {
        from: current.rangeStart.toISOString(),
        to: current.rangeEndExclusive.toISOString(),
        compareFrom: prior.rangeStart.toISOString(),
        compareTo: prior.rangeEndExclusive.toISOString(),
        scopedLocationId: scope.locationId,
        patternsAvailable,
        intelligentEngine,
      },
      kpis,
      movement: enrichedMovement,
      newItems,
      slowdowns,
      patterns,
      intelligent: intelligentSignals,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load item trends";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
