import { NextRequest, NextResponse } from "next/server";

import { updateOutlet } from "@/lib/outlet-utils";
import { requirePermission } from "@/lib/rbac";

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as { outletId?: unknown; name?: unknown };
  const outletId = typeof body.outletId === "string" ? body.outletId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!outletId || !name) {
    return NextResponse.json({ error: "outletId and name are required" }, { status: 400 });
  }

  try {
    const outlet = await updateOutlet(outletId, companyId, { name });
    return NextResponse.json({ outlet });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update outlet";
    return NextResponse.json({ error: msg }, { status: error instanceof Error && error.message === "Outlet not found" ? 404 : 503 });
  }
}
