import { NextRequest, NextResponse } from "next/server";

import { deleteOutlet } from "@/lib/outlet-utils";
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

  const body = await request.json().catch(() => ({})) as { outletId?: unknown };
  const outletId = typeof body.outletId === "string" ? body.outletId : "";
  if (!outletId) {
    return NextResponse.json({ error: "outletId is required" }, { status: 400 });
  }

  try {
    await deleteOutlet(outletId, companyId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete outlet";
    return NextResponse.json({ error: msg }, { status: error instanceof Error && error.message === "Outlet not found" ? 404 : 503 });
  }
}
