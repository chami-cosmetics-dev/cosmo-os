import { NextRequest, NextResponse } from "next/server";

import { listMerchantGroupSettings, setMerchantGroupMembers } from "@/lib/merchant-groups";
import { requirePermission } from "@/lib/rbac";

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { groupId?: string; userIds?: unknown } | null;
  const groupId = body?.groupId?.trim();
  const userIds = Array.isArray(body?.userIds)
    ? body.userIds.filter((value): value is string => typeof value === "string")
    : [];
  if (!groupId) {
    return NextResponse.json({ error: "Group is required" }, { status: 400 });
  }

  try {
    await setMerchantGroupMembers(companyId, groupId, userIds);
    return NextResponse.json(await listMerchantGroupSettings(companyId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update group members";
    return NextResponse.json({ error: message }, { status: message === "Merchant group not found" ? 404 : 503 });
  }
}
