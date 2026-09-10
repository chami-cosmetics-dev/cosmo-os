import { NextRequest, NextResponse } from "next/server";

import { formatMarketCompareCsvRows } from "@/lib/market-prices/export";
import { buildMarketCompareSummary } from "@/lib/market-prices/summary";
import type { MarketPriceFilterKey } from "@/lib/market-prices/types";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { marketPricePageDataQuerySchema } from "@/lib/validation/market-prices";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.market_prices.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = marketPricePageDataQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const query = parsed.data;

  const filters: MarketPriceFilterKey[] = query.filter
    ? (query.filter
        .split(",")
        .map((f) => f.trim())
        .filter((f): f is MarketPriceFilterKey =>
          ["above_market", "cheapest", "stale", "has_links", "untracked"].includes(f),
        ))
    : [];

  const result = await buildMarketCompareSummary(companyId, {
    layer: query.layer,
    sort: query.sort,
    filter: filters,
    competitor: query.competitor,
    brand: query.brand,
    priority: query.priority,
    q: query.q,
    page: 1,
    limit: 1000,
  });

  const csvBody = formatMarketCompareCsvRows(result.rows);

  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="market_prices_export.csv"',
    },
  });
}
