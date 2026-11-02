import { NextResponse } from "next/server";

import {
  listItemCreationBrandAllocations,
  saveItemCreationBrandAllocations,
} from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";

const PERMISSIONS = ["item_creation.digital_marketing.admin", "item_creation.admin.manage_all"];

export async function GET() {
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
