import { NextRequest, NextResponse } from "next/server";

import { removeUserFromOutlet, getOutletById } from "@/lib/outlet-utils";
import { requirePermission } from "@/lib/rbac";

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as { outletId?: unknown; userId?: unknown };
  const outletId = typeof body.outletId === "string" ? body.outletId : "";
  const userId = typeof body.userId === "string" ? body.userId : "";

  if (!outletId || !userId) {
    return NextResponse.json({ error: "outletId and userId are required" }, { status: 400 });
  }

  try {
    await removeUserFromOutlet(outletId, userId);
    const outlet = await getOutletById(outletId, companyId);
    return NextResponse.json({ outlet });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to remove user";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
