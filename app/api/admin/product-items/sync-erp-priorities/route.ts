import { NextResponse } from "next/server";

import { syncOgfPricesFromErp } from "@/lib/osf/sync-ogf-prices-from-erp";
import { syncErpProductPriorities } from "@/lib/product-items/erp-priority-sync";
import { requirePermission } from "@/lib/rbac";
import { syncStandardSellingToProductItems } from "@/lib/sticker-lwk-erp-price";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/product-items/sync-erp-priorities
 * Pull ERP1/ERP2 Product Priority, Cosmo Standard Selling → ProductItem.price,
 * and LWK OGF Price List → ProductOsfProfile.ogfPrice.
 */
export async function POST() {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  try {
    const [result, prices, ogfPrices] = await Promise.all([
      syncErpProductPriorities(companyId),
      syncStandardSellingToProductItems(companyId),
      syncOgfPricesFromErp(companyId),
    ]);
    const anyOk = result.sources.some((s) => s.status === "ok");
    const anyFailed = result.sources.some((s) => s.status === "failed");
    const priceFailed = prices.status === "failed";
    const ogfFailed = ogfPrices.status === "failed";
    if (!anyOk && anyFailed && priceFailed && ogfFailed) {
      return NextResponse.json(
        { error: "ERP priority and price sync failed", ...result, prices, ogfPrices },
        { status: 502 },
      );
    }
    if (!anyOk && anyFailed) {
      return NextResponse.json(
        { error: "Both ERP sources failed or are unavailable", ...result, prices, ogfPrices },
        { status: 502 },
      );
    }
    return NextResponse.json({ ...result, prices, ogfPrices });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERP sync failed";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
