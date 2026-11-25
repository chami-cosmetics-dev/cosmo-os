import { NextRequest, NextResponse } from "next/server";

import { resolveItemDraftingAccess } from "@/lib/discontinued-items/config";
import { loadPurchasingApproval } from "@/lib/discontinued-items/purchasing-approval.server";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

/** Purchasing Approval list. `?refresh=1` re-reads the ERP Items + stock (shared with Stock Health). */
export async function GET(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const access = resolveItemDraftingAccess((key) => hasPermission(auth.context, key));
  if (!access.canPurchasingApproval) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    return NextResponse.json(await loadPurchasingApproval(companyId, { refresh }));
  } catch (error) {
    console.error("Discontinued Items: Purchasing Approval load failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Purchasing Approval" },
      { status: 502 },
    );
  }
}
