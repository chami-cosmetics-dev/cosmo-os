import { NextRequest, NextResponse } from "next/server";

import { resolveItemTrendWindows } from "@/lib/item-trends/aggregate";
import { fetchOutletBalanceAndTransfers } from "@/lib/item-trends/outlets";
import { resolveItemTrendsScope } from "@/lib/item-trends/scope";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { itemTrendsOutletsQuerySchema } from "@/lib/validation";

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
  const parsed = itemTrendsOutletsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { from, to, sku, columnKey, transfersOnly, priority, includeStock } = parsed.data;

  try {
    const range =
      from && to ? resolveItemTrendWindows({ fromYmd: from, toYmd: to }).current : null;
    const scope = await resolveItemTrendsScope(context);

    if (columnKey && scope.columnKeys && !scope.columnKeys.includes(columnKey)) {
      return NextResponse.json({ error: "Forbidden outlet scope" }, { status: 403 });
    }

    const columnKeys =
      columnKey ? [columnKey]
      : scope.columnKeys;

    const { outlets, transfers, stockLoaded } = await fetchOutletBalanceAndTransfers({
      companyId,
      range,
      columnKeys,
      skuFilter: sku ? [sku] : undefined,
      priority: priority ?? "all",
      includeStock,
    });

    return NextResponse.json({
      outlets: transfersOnly ? [] : outlets,
      transfers,
      meta: {
        stockLoaded,
        speedBasis: range ? "range" : "lifetime",
        from: range?.fromYmd ?? null,
        to: range?.toYmd ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load outlets";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
