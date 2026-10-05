import { NextResponse } from "next/server";

import { retryPurchaseReceipt } from "@/lib/item-creation/automation";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyPermission([
    ITEM_CREATION_PERMISSIONS.stores,
    ITEM_CREATION_PERMISSIONS.admin,
  ]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await params;
    const receipt = await retryPurchaseReceipt(auth.context!, id);
    return NextResponse.json({ receipt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt retry failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
