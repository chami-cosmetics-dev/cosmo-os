import { NextRequest, NextResponse } from "next/server";

import { createMerchantGroup, listMerchantGroupSettings } from "@/lib/merchant-groups";
import { requirePermission } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }

  try {
    await createMerchantGroup(companyId, name);
    return NextResponse.json(await listMerchantGroupSettings(companyId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create merchant group";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
