import { NextRequest, NextResponse } from "next/server";

import { resolveItemDraftingAccess } from "@/lib/discontinued-items/config";
import { loadShopifyDraft } from "@/lib/discontinued-items/shopify-draft.server";
import { runDraftVerification } from "@/lib/discontinued-items/verification.server";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Re-check now (read-only Shopify lookup) the Draft clicks whose check failed: one SKU
 * (`{ sku }`) or all (`{}`). Returns the summary and the refreshed list.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const access = resolveItemDraftingAccess((key) => hasPermission(auth.context, key));
  if (!access.canActShopifyDraft && !access.isManager) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as { sku?: unknown } | null;
  const sku = typeof body?.sku === "string" && body.sku ? body.sku : null;
  try {
    const summary = await runDraftVerification({ recheckSkus: sku ? [sku] : null });
    return NextResponse.json({ summary, data: await loadShopifyDraft(companyId) });
  } catch (error) {
    console.error("Discontinued Items: re-check failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Re-check failed" },
      { status: 502 },
    );
  }
}
