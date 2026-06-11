import { NextRequest, NextResponse } from "next/server";

import { fetchOutletReviewSheetData } from "@/lib/page-data/outlet-review-sheet";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["outlets.read.all", "outlets.read.assigned"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  const viewerUserId = auth.context.user?.id ?? null;
  if (!companyId || !viewerUserId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const canReadAll = hasPermission(auth.context, "outlets.read.all");
  const { searchParams } = request.nextUrl;
  const outletId = searchParams.get("outletId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const data = await fetchOutletReviewSheetData({
    companyId,
    viewerUserId,
    canReadAll,
    outletId,
    startDate,
    endDate,
  });

  return NextResponse.json(data);
}
