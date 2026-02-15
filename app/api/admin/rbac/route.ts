import { NextResponse } from "next/server";

import { listRbacData, requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission("users.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const data = await listRbacData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/rbac error:", error);
    return NextResponse.json(
      { error: "Failed to load user management data" },
      { status: 500 }
    );
  }
}
