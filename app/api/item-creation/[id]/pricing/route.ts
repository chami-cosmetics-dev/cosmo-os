import { NextResponse } from "next/server";

import { getItemCreationPricing } from "@/lib/item-creation/automation";
import { ITEM_CREATION_PERMISSIONS } from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyPermission([
    ITEM_CREATION_PERMISSIONS.purchasing,
    ITEM_CREATION_PERMISSIONS.admin,
  ]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await params;
    const pricing = await getItemCreationPricing(auth.context!, id);
    return NextResponse.json({ pricing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pricing lookup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
