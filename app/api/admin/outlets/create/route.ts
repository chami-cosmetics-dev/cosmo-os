import { NextRequest, NextResponse } from "next/server";

import { createOutlet, getOutletsByCompanyId } from "@/lib/outlet-utils";
import { requirePermission } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Outlet name is required" }, { status: 400 });
  }

  // Check duplicate
  const existing = await getOutletsByCompanyId(companyId);
  if (existing.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "An outlet with this name already exists" }, { status: 400 });
  }

  try {
    const outlet = await createOutlet({ companyId, name });
    return NextResponse.json({ outlet }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create outlet";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
