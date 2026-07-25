import { NextResponse } from "next/server";

import { syncErpProductPriorities } from "@/lib/product-items/erp-priority-sync";
import { syncOgfPricesFromErp } from "@/lib/osf/sync-ogf-prices-from-erp";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const maxDuration = 300;

export async function POST() {
  const auth = await requirePermission("purchasing.osf.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  try {
    const [priorityResult, ogfResult] = await Promise.all([
      syncErpProductPriorities(companyId),
      syncOgfPricesFromErp(companyId),
    ]);
    const anyOk = priorityResult.sources.some((s) => s.status === "ok");
    const anyFailed = priorityResult.sources.some((s) => s.status === "failed");
    if (!anyOk && anyFailed && ogfResult.status === "failed") {
      return NextResponse.json(
        {
          error: "ERP priority and OGF price sync failed",
          ...priorityResult,
          ogfPrices: ogfResult,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ...priorityResult, ogfPrices: ogfResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Priority sync failed";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
