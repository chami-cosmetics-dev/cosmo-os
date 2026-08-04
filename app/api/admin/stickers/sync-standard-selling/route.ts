import { NextResponse } from "next/server";

import { requireAnyPermission } from "@/lib/rbac";
import { syncStandardSellingToProductItems } from "@/lib/sticker-lwk-erp-price";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/stickers/sync-standard-selling
 * Sync Cosmo ERP Standard Selling → ProductItem.price
 */
export async function POST() {
  const auth = await requireAnyPermission([
    "purchasing.osf.read",
    "purchasing.osf.manage",
    "products.read",
    "stickers.batch.manage",
    "stickers.batch.read",
    "stickers.print.read",
    "stickers.print.print",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 404 });
  }

  const result = await syncStandardSellingToProductItems(companyId);
  if (result.status === "failed") {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
