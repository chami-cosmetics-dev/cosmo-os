import { NextResponse } from "next/server";

import { DISCONTINUED_ITEMS_PERMISSIONS } from "@/lib/discontinued-items/config";
import { notifyPendingIfDue } from "@/lib/discontinued-items/notifications";
import {
  clearDryRunClicks,
  isDiscontinueTestMode,
} from "@/lib/discontinued-items/purchasing-approval.server";
import { hasAnyPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Test mode only: undoes every dry-run click so the buttons can be tried again. */
export async function POST() {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (
    !hasAnyPermission(auth.context, [
      DISCONTINUED_ITEMS_PERMISSIONS.purchasingApproval,
      DISCONTINUED_ITEMS_PERMISSIONS.manager,
    ])
  ) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  if (!isDiscontinueTestMode()) {
    return NextResponse.json({ error: "Only available in test mode" }, { status: 400 });
  }
  const reset = await clearDryRunClicks();
  // Clears the pending-notification record if the reset took the pending count to 0.
  await notifyPendingIfDue().catch((error) =>
    console.error("Discontinued Items: pending notification after reset failed:", error),
  );
  return NextResponse.json({ reset });
}
