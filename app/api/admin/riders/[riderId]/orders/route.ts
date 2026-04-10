import { NextRequest, NextResponse } from "next/server";

import { fetchRiderOrdersData } from "@/lib/page-data/riders";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ riderId: string }> }
) {
  const auth = await requirePermission("staff.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const roleNames = auth.context!.roleNames as string[];
  const isSuperAdmin = roleNames.includes("super_admin");
  const companyId = isSuperAdmin ? null : (auth.context!.user?.companyId ?? null);
  if (!isSuperAdmin && !companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { riderId } = await params;
  const riderIdResult = cuidSchema.safeParse(riderId);
  if (!riderIdResult.success) {
    return NextResponse.json({ error: "Invalid rider ID" }, { status: 400 });
  }

  const data = await fetchRiderOrdersData(companyId, riderIdResult.data);
  if (!data.rider) {
    return NextResponse.json({ error: "Rider not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
