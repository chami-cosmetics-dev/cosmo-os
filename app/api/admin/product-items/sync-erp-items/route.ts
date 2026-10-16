import { NextRequest, NextResponse } from "next/server";

import { syncErpItemCatalog } from "@/lib/product-items/erp-item-catalog-sync";
import { syncStandardSellingToProductItems } from "@/lib/sticker-lwk-erp-price";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/product-items/sync-erp-items
 * Pull new/changed Items from ERP1 + ERP2 (`modified >= now - lookbackDays`), upsert them onto
 * ProductItem (see `syncErpItemCatalog` for the create/update rules), then backfill Standard
 * Selling price on anything just created (new rows land at price = 0 until this runs).
 *
 * Optional query param: ?lookbackDays=<n> (default 14, mirrors ERP SI reconcile's lookback).
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission("products.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const lookbackParam = request.nextUrl.searchParams.get("lookbackDays");
  const lookbackDays = lookbackParam ? Number(lookbackParam) : undefined;
  if (lookbackParam && (!Number.isFinite(lookbackDays) || (lookbackDays as number) <= 0)) {
    return NextResponse.json({ error: "lookbackDays must be a positive number" }, { status: 400 });
  }

  try {
    const result = await syncErpItemCatalog(companyId, { lookbackDays });
    const anyOk = result.sources.some((s) => s.status === "ok");
    const anyFailed = result.sources.some((s) => s.status === "failed");
    if (!anyOk && anyFailed) {
      return NextResponse.json({ error: "Both ERP sources failed or are unavailable", ...result }, { status: 502 });
    }

    // Newly created rows land at price = 0 — backfill from Standard Selling right away.
    const prices =
      result.created > 0
        ? await syncStandardSellingToProductItems(companyId)
        : { status: "ok" as const, updated: 0, error: null };

    return NextResponse.json({ ...result, prices });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERP item catalog sync failed";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
