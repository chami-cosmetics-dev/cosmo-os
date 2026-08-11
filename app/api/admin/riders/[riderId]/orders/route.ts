import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fetchRiderOrdersData } from "@/lib/page-data/riders";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(
  request: NextRequest,
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

  const fromRaw = request.nextUrl.searchParams.get("from");
  const toRaw = request.nextUrl.searchParams.get("to");
  const from = fromRaw ? ymdSchema.safeParse(fromRaw) : null;
  const to = toRaw ? ymdSchema.safeParse(toRaw) : null;
  if ((fromRaw && !from?.success) || (toRaw && !to?.success)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const data = await fetchRiderOrdersData(companyId, riderIdResult.data, {
    from: from?.success ? from.data : null,
    to: to?.success ? to.data : null,
  });
  return NextResponse.json(data);
}
