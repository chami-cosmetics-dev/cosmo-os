import { NextRequest, NextResponse } from "next/server";

import { DISCONTINUED_ITEMS_PERMISSIONS } from "@/lib/discontinued-items/config";
import {
  disableDiscontinuedItem,
  PurchasingApprovalError,
} from "@/lib/discontinued-items/purchasing-approval.server";
import { notifyPendingIfDue } from "@/lib/discontinued-items/notifications";
import { erpDocumentOwner } from "@/lib/erp-payment-entry-owner";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * ERP 1 / Website or ERP 2 button: disables the item in that ERP (a dry run in test mode).
 * Needs the Purchasing Approval permission itself — Manager alone is view + download only.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, DISCONTINUED_ITEMS_PERMISSIONS.purchasingApproval)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { sku?: unknown; erp?: unknown; remark?: unknown }
    | null;
  const sku = typeof body?.sku === "string" ? body.sku : "";
  const erp = body?.erp === "erp1" || body?.erp === "erp2" ? body.erp : null;
  const remark = typeof body?.remark === "string" ? body.remark : "";
  if (!sku || !erp) return NextResponse.json({ error: "sku and erp are required" }, { status: 400 });

  try {
    const result = await disableDiscontinuedItem({
      companyId,
      sku,
      erp,
      remark,
      userName: auth.user.name?.trim() || auth.user.email || "Unknown user",
      erpOwner: erpDocumentOwner(auth.user),
    });
    // First "pending" notification goes straight away (later ones weekly, from the cron); also
    // clears the pending record when the count reaches 0. Never fails the click.
    await notifyPendingIfDue().catch((error) =>
      console.error("Discontinued Items: pending notification failed:", error),
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PurchasingApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(`Discontinued Items: disable ${sku} in ${erp} failed:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disable the item" },
      { status: 502 },
    );
  }
}
