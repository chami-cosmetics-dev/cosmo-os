import { NextRequest, NextResponse } from "next/server";
import { ItemCreationErp } from "@prisma/client";

import { getItemCreationStockOptions } from "@/lib/item-creation/automation";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";
import { STORE_ALLOCATION_PERMISSION } from "@/lib/store-allocation/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([
    ITEM_CREATION_PERMISSIONS.stores,
    ITEM_CREATION_PERMISSIONS.manageAll,
    STORE_ALLOCATION_PERMISSION,
  ]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const erpParam = request.nextUrl.searchParams.get("erp")?.toUpperCase();
  let erp: ItemCreationErp | null = null;
  if (erpParam === ItemCreationErp.ERP1) erp = ItemCreationErp.ERP1;
  if (erpParam === ItemCreationErp.ERP2) erp = ItemCreationErp.ERP2;
  if (!erp) return NextResponse.json({ error: "ERP must be ERP1 or ERP2" }, { status: 400 });

  try {
    const options = await getItemCreationStockOptions(auth.context!, erp, { allowStoreAllocation: true });
    return NextResponse.json(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stock options";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
