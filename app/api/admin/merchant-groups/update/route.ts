import { NextRequest, NextResponse } from "next/server";

import { listMerchantGroupSettings, updateMerchantGroup } from "@/lib/merchant-groups";
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

  const body = (await request.json().catch(() => null)) as { groupId?: string; name?: string } | null;
  const groupId = body?.groupId?.trim();
  const name = body?.name?.trim();
  if (!groupId || !name) {
    return NextResponse.json({ error: "Group and name are required" }, { status: 400 });
  }

  try {
    await updateMerchantGroup(companyId, groupId, name);
    return NextResponse.json(await listMerchantGroupSettings(companyId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update merchant group";
    return NextResponse.json({ error: message }, { status: message === "Merchant group not found" ? 404 : 503 });
  }
}
