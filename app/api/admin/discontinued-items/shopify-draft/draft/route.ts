import { NextRequest, NextResponse } from "next/server";

import { DISCONTINUED_ITEMS_PERMISSIONS } from "@/lib/discontinued-items/config";
import { PurchasingApprovalError } from "@/lib/discontinued-items/purchasing-approval.server";
import { markDrafted } from "@/lib/discontinued-items/shopify-draft.server";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Draft button: records who / when only — nothing is changed in Shopify. Irreversible. */
export async function POST(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, DISCONTINUED_ITEMS_PERMISSIONS.shopifyDraft)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { sku?: unknown; redirectionLink?: unknown } | null;
  const sku = typeof body?.sku === "string" ? body.sku : "";
  if (!sku) return NextResponse.json({ error: "sku is required" }, { status: 400 });
  try {
    return NextResponse.json(
      await markDrafted({
        sku,
        userName: auth.user.name?.trim() || auth.user.email || "Unknown user",
        redirectionLink: body?.redirectionLink,
      }),
    );
  } catch (error) {
    if (error instanceof PurchasingApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(`Discontinued Items: draft ${sku} failed:`, error);
    return NextResponse.json({ error: "Failed to record the draft" }, { status: 500 });
  }
}
