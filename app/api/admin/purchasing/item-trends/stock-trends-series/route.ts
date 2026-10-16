import { NextRequest, NextResponse } from "next/server";

import {
  getStockTrendSeriesForBaseSku,
  getStockTrendSeriesForSku,
  isBaseSkuOnly,
} from "@/lib/item-trends/stock-trends";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { stockTrendsSeriesQuerySchema } from "@/lib/validation";

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
  const parsed = stockTrendsSeriesQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { sku, channel } = parsed.data;

  try {
    // The panel only detects base SKUs among its loaded rows; a base SKU whose
    // variants are filtered out of the table still resolves to variant mode here.
    const mode = parsed.data.mode === "sku" && (await isBaseSkuOnly(companyId, sku)) ? "base" : parsed.data.mode;
    if (mode === "base") {
      const variants = await getStockTrendSeriesForBaseSku(companyId, sku, channel);
      return NextResponse.json({ baseSku: sku, variants });
    }
    const { series, currentStock, info } = await getStockTrendSeriesForSku(companyId, sku, channel);
    return NextResponse.json({ sku, series, currentStock, info });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stock trend series";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
