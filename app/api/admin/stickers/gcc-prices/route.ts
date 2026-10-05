import { NextRequest, NextResponse } from "next/server";

import { loadGccPricesForSkus } from "@/lib/sticker-lwk-erp-price";
import { requireAnyPermission } from "@/lib/rbac";
import { LIMITS } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/stickers/gcc-prices?sku=CE68_1&sku=...
 * Returns ERP GCC PRICE LIST rates for Chami shop stickers (location 005).
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

  try {
    const prices = await loadGccPricesForSkus({
      companyId,
      itemCodes: skus.slice(0, 100),
    });
    return NextResponse.json({ prices });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load GCC prices from ERP";
    return NextResponse.json({ prices: {}, error: message.slice(0, 300) }, { status: 502 });
  }
}
