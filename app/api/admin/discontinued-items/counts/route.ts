import { NextResponse } from "next/server";

import { resolveItemDraftingAccess } from "@/lib/discontinued-items/config";
import { countDiscontinuedReminders } from "@/lib/discontinued-items/notifications";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Tab badge counts (Pending / approved for Shopify draft), from the saved status. */
export async function GET() {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const access = resolveItemDraftingAccess((key) => hasPermission(auth.context, key));
  if (!access.canPurchasingApproval && !access.canShopifyDraft) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  return NextResponse.json(await countDiscontinuedReminders());
}
