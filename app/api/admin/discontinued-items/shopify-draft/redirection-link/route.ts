import { NextRequest, NextResponse } from "next/server";

import { DISCONTINUED_ITEMS_PERMISSIONS } from "@/lib/discontinued-items/config";
import { PurchasingApprovalError } from "@/lib/discontinued-items/purchasing-approval.server";
import { saveRedirectionLink } from "@/lib/discontinued-items/shopify-draft.server";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Save the optional redirection link (until Draft is clicked). */
export async function PATCH(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, DISCONTINUED_ITEMS_PERMISSIONS.shopifyDraft)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { sku?: unknown; redirectionLink?: unknown } | null;
  const sku = typeof body?.sku === "string" ? body.sku : "";
  if (!sku) return NextResponse.json({ error: "sku is required" }, { status: 400 });
  try {
    return NextResponse.json({ redirectionLink: await saveRedirectionLink(sku, body?.redirectionLink) });
  } catch (error) {
    if (error instanceof PurchasingApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(`Discontinued Items: redirection link for ${sku} failed:`, error);
    return NextResponse.json({ error: "Failed to save the link" }, { status: 500 });
  }
}
