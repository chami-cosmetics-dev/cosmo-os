import { NextRequest, NextResponse } from "next/server";

import { lookupItemCreationStockItems } from "@/lib/item-creation/automation";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([
    ITEM_CREATION_PERMISSIONS.stores,
    ITEM_CREATION_PERMISSIONS.manageAll,
  ]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const items = await lookupItemCreationStockItems(auth.context!, request.nextUrl.searchParams.get("q") ?? "");
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Existing item lookup failed" },
      { status: 400 },
    );
  }
}
