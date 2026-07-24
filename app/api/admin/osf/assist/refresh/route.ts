import { NextResponse } from "next/server";

import { syncErpProductPriorities } from "@/lib/product-items/erp-priority-sync";
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
    const result = await syncErpProductPriorities(companyId);
    const anyOk = result.sources.some((s) => s.status === "ok");
    const anyFailed = result.sources.some((s) => s.status === "failed");
    if (!anyOk && anyFailed) {
      return NextResponse.json(
        { error: "Both ERP sources failed or are unavailable", ...result },
        { status: 502 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Priority sync failed";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
