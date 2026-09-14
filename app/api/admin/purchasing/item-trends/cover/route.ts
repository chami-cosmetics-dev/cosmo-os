import { NextRequest, NextResponse } from "next/server";

import { resolveItemTrendWindows } from "@/lib/item-trends/aggregate";
import { fetchCoverRows } from "@/lib/item-trends/cover-rows";
import { resolveItemTrendsScope } from "@/lib/item-trends/scope";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { itemTrendsCoverQuerySchema } from "@/lib/validation";

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
  const parsed = itemTrendsCoverQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { from, to, priority, brand, sku, commonSkuKey, snapshotDate, stockSource, erpScope, columnKeys, oosOnly } =
    parsed.data;
  const keys = columnKeys
    ?.split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  try {
    const scope = await resolveItemTrendsScope(context);
    const { current } = resolveItemTrendWindows({ fromYmd: from, toYmd: to });
    const scopedKeys = keys?.length ? keys : scope.columnKeys;

    const result = await fetchCoverRows({
      companyId,
      range: current,
      columnKeys: scopedKeys,
      skuFilter: sku ? [sku] : undefined,
      commonSkuKey,
      snapshotDate,
      stockSource,
      erpScope,
      priority: priority ?? "all",
      brand,
      oosOnly,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load cover";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
