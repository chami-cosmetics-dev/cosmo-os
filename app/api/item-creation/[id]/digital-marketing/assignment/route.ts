import { NextResponse } from "next/server";

import { assignItemCreationDigitalMarketingUser } from "@/lib/item-creation/workflow";
import { requireAnyPermission } from "@/lib/rbac";

const PERMISSIONS = ["item_creation.digital_marketing.admin", "item_creation.admin.manage_all"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyPermission(PERMISSIONS);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await params;
    const body = await request.json();
    const item = await assignItemCreationDigitalMarketingUser(
      auth.context!,
      id,
      body.assigneeId ? String(body.assigneeId) : null,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update item assignment" },
      { status: 400 },
    );
  }
}
