import { NextRequest, NextResponse } from "next/server";

import { resolveItemDraftingAccess } from "@/lib/discontinued-items/config";
import { loadItemDraftingDashboard } from "@/lib/discontinued-items/dashboard.server";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report / read the stock ledger when the cache is cold. */
export const maxDuration = 300;

/** Dashboard tab (read-only). `?refresh=1` re-reads the ERP data. */
export async function GET(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const access = resolveItemDraftingAccess((key) => hasPermission(auth.context, key));
  if (!access.canPurchasingApproval && !access.canShopifyDraft) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    return NextResponse.json(await loadItemDraftingDashboard(companyId, { refresh }));
  } catch (error) {
    console.error("Discontinued Items: dashboard load failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load the dashboard" },
      { status: 502 },
    );
  }
}
