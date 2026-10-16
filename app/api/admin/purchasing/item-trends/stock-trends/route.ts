import { NextRequest, NextResponse } from "next/server";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { getStockTrendItems, type StockTrendItemRow } from "@/lib/item-trends/stock-trends";
import { countByMovement } from "@/lib/item-trends/stock-trend-movement";
import { STOCK_TRENDS_DEFAULT_RANGE_MONTHS } from "@/lib/item-trends/stock-trends-config";
import { skuMatchesSearch } from "@/lib/item-trends/sku-group";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { stockTrendsQuerySchema } from "@/lib/validation";

export const maxDuration = 300;

function defaultCreatedDateTo(): string {
  return formatAppIsoDate(new Date());
}

function defaultCreatedDateFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - STOCK_TRENDS_DEFAULT_RANGE_MONTHS);
  return formatAppIsoDate(d);
}

function matchesSearch(row: StockTrendItemRow, skuSearch?: string, titleSearch?: string): boolean {
  if (skuSearch && !skuMatchesSearch(row.sku, null, skuSearch)) return false;
  if (titleSearch) {
    const title = (row.productTitle ?? "").trim().toLowerCase();
    if (!title.includes(titleSearch.trim().toLowerCase())) return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  console.log("[stock-trends] 1: GET started");
  const auth = await requirePermission("purchasing.item_trends.read");
  console.log("[stock-trends] 2: requirePermission resolved, ok=", auth.ok);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  console.log("[stock-trends] 3: getCurrentUserContext resolved");
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = stockTrendsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { brand, skuSearch, titleSearch, channel, sortOrder, movement, refresh } = parsed.data;
  const createdDateFrom = parsed.data.createdDateFrom ?? defaultCreatedDateFrom();
  const createdDateTo = parsed.data.createdDateTo ?? defaultCreatedDateTo();

  try {
    // Priority is intentionally not passed here — it's no longer filtered
    // server-side. All priorities for this brand/date-range load, and the
    // client filters by StockTrendItemRow.priorityStatus locally.
    const allRows = await getStockTrendItems(companyId, {
      brand,
      createdDateFrom,
      createdDateTo,
      channel,
      sortOrder,
    }, { bypassCache: refresh });

    // No pagination here — every matching row was already computed above
    // (priority filtering, the only thing that used to bound this set, moved
    // client-side), so slicing would just discard already-done work. The
    // client paginates the priority-filtered result itself.
    const searchedRows = allRows.filter((row) => matchesSearch(row, skuSearch, titleSearch));
    // Counts are taken before the movement post-filter so every toggle option
    // can show its own count while one of them is selected.
    const movementCounts = countByMovement(searchedRows);
    const rows =
      movement === "all" ? searchedRows : searchedRows.filter((row) => row.movementStatus === movement);

    return NextResponse.json({
      rows,
      total: rows.length,
      movementCounts,
      meta: {
        createdDateFrom,
        createdDateTo,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stock trends";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
