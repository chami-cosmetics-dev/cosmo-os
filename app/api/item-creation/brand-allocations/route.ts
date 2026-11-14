import { NextResponse } from "next/server";

import {
  listItemCreationBrandAllocations,
  saveItemCreationBrandAllocations,
} from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

const PERMISSIONS = ["item_creation.digital_marketing.admin", "item_creation.admin.manage_all"];

export async function GET() {
  if (isVaultOsDeployment()) return NextResponse.json({ error: "Brand allocation is unavailable in Vault OS" }, { status: 404 });
  const auth = await requireAnyPermission(PERMISSIONS);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json(await listItemCreationBrandAllocations(auth.context!));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load brand allocations" },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  if (isVaultOsDeployment()) return NextResponse.json({ error: "Brand allocation is unavailable in Vault OS" }, { status: 404 });
  const auth = await requireAnyPermission(PERMISSIONS);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    return NextResponse.json(
      await saveItemCreationBrandAllocations(auth.context!, body.allocations),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save brand allocations" },
      { status: 400 },
    );
  }
}
