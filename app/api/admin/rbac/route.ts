import { NextResponse } from "next/server";

import { ensureDefaultRbacSetup, listRbacData, requirePermission } from "@/lib/rbac";

export async function POST() {
  const auth = await requirePermission("roles.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    await ensureDefaultRbacSetup();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/rbac error:", error);
    return NextResponse.json({ error: "Failed to sync RBAC data" }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requirePermission("users.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const roleNames = auth.context!.roleNames as string[];
    const data = await listRbacData({
      companyId: auth.context!.user?.companyId ?? null,
      isSuperAdmin: roleNames.includes("super_admin"),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/rbac error:", error);
    return NextResponse.json(
      { error: "Failed to load user management data" },
      { status: 500 }
    );
  }
}
