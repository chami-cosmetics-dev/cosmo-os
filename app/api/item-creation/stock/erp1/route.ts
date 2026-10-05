import { NextRequest, NextResponse } from "next/server";
import { ItemCreationErp } from "@prisma/client";

import { createWarehousePurchaseReceipts } from "@/lib/item-creation/automation";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission([
    ITEM_CREATION_PERMISSIONS.stores,
    ITEM_CREATION_PERMISSIONS.admin,
  ]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const receipts = await createWarehousePurchaseReceipts(auth.context!, ItemCreationErp.ERP1, body);
    return NextResponse.json({ receipts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERP1 stock update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
