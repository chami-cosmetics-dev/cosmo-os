import { NextResponse } from "next/server";

import { resolveItemDraftingAccess } from "@/lib/discontinued-items/config";
import { loadShopifyDraft } from "@/lib/discontinued-items/shopify-draft.server";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Shopify Draft list + the latest Search Console report. */
export async function GET() {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const access = resolveItemDraftingAccess((key) => hasPermission(auth.context, key));
  if (!access.canShopifyDraft) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  try {
    return NextResponse.json(await loadShopifyDraft(companyId));
  } catch (error) {
    console.error("Discontinued Items: Shopify Draft load failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Shopify Draft" },
      { status: 500 },
    );
  }
}
