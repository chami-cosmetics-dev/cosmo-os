import { NextRequest, NextResponse } from "next/server";

import { OsfErpError } from "@/lib/osf/erp-stock";
import {
  fetchStandardSellingPricesBySku,
  resolveCosmoCatalogErpInstance,
} from "@/lib/sticker-lwk-erp-price";
import { requireAnyPermission } from "@/lib/rbac";
import { LIMITS } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/stickers/standard-selling-prices?sku=CE68_1&sku=...
 * Returns Cosmo ERP Standard Selling rates for non-LWK stickers.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([
    "stickers.batch.manage",
    "stickers.batch.read",
    "stickers.print.read",
    "stickers.print.print",
  ]);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status }
    );
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 404 });
  }

  const skus = request.nextUrl.searchParams
    .getAll("sku")
    .map((s) => s.trim().slice(0, LIMITS.sku.max))
    .filter(Boolean);

  if (skus.length === 0) {
    return NextResponse.json({ prices: {} as Record<string, string> });
  }

  const instance = await resolveCosmoCatalogErpInstance(companyId);
  if (!instance) {
    return NextResponse.json({
      prices: {},
      error: "No Cosmo ERP instance for Standard Selling",
    });
  }

  try {
    const prices = await fetchStandardSellingPricesBySku({
      cfg: instance.cfg,
      itemCodes: skus.slice(0, 100),
    });
    return NextResponse.json({ prices });
  } catch (err) {
    const message =
      err instanceof OsfErpError
        ? err.message
        : "Failed to load Standard Selling prices from ERP";
    return NextResponse.json({ prices: {}, error: message }, { status: 502 });
  }
}
