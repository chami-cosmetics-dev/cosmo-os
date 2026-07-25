import { NextResponse } from "next/server";

import { syncOgfPricesFromErp } from "@/lib/osf/sync-ogf-prices-from-erp";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/osf/sync-ogf-prices
 * Sync Cosmo ERP OGF Price List (LWK) → ProductOsfProfile.ogfPrice
 */
export async function POST() {
  const auth = await requireAnyPermission([
    "purchasing.osf.read",
    "purchasing.osf.manage",
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
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const result = await syncOgfPricesFromErp(companyId);
  if (result.status === "failed") {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
