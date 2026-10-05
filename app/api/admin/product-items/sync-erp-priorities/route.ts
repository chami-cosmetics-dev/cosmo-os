import { NextResponse } from "next/server";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { syncOgfPricesFromErp } from "@/lib/osf/sync-ogf-prices-from-erp";
import { syncErpProductPriorities } from "@/lib/product-items/erp-priority-sync";
import { syncVaultErpCatalogToProductItems } from "@/lib/product-items/vault-erp-catalog-sync";
import { requirePermission } from "@/lib/rbac";
import { syncStandardSellingToProductItems } from "@/lib/sticker-lwk-erp-price";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/product-items/sync-erp-priorities
 * Cosmo: Product Priority + Standard Selling + LWK OGF.
 * Vault: upsert ERP1/ERP2 stock Items (price from Item Price Standard Selling), then priorities.
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

  const vault = isVaultOsDeployment();

  try {
    const catalog = vault
      ? await syncVaultErpCatalogToProductItems(companyId)
      : {
          status: "skipped" as const,
          created: 0,
          updated: 0,
          catalogSize: 0,
          erp1Count: 0,
          erp2Count: 0,
          error: null,
        };

    if (vault && catalog.status === "failed") {
      return NextResponse.json(
        { error: catalog.error ?? "Vault ERP catalog sync failed", catalog },
        { status: 502 },
      );
    }

    const [result, prices, ogfPrices] = await Promise.all([
      syncErpProductPriorities(companyId),
      syncStandardSellingToProductItems(companyId),
      vault
        ? Promise.resolve({ status: "skipped" as const, updated: 0, error: null })
        : syncOgfPricesFromErp(companyId),
    ]);
    const anyOk = result.sources.some((s) => s.status === "ok");
    const anyFailed = result.sources.some((s) => s.status === "failed");
    const priceFailed = prices.status === "failed";
    const ogfFailed = ogfPrices.status === "failed";
    if (!vault && !anyOk && anyFailed && priceFailed && ogfFailed) {
      return NextResponse.json(
        { error: "ERP priority and price sync failed", ...result, prices, ogfPrices, catalog },
        { status: 502 },
      );
    }
    if (!anyOk && anyFailed) {
      return NextResponse.json(
        {
          error: "Both ERP sources failed or are unavailable",
          ...result,
          prices,
          ogfPrices,
          catalog,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ...result, prices, ogfPrices, catalog });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERP sync failed";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
