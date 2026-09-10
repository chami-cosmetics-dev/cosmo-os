import { NextRequest, NextResponse } from "next/server";

import { fetchCallCenterPerformanceRows } from "@/lib/page-data/call-center-performance";
import { requireAnyPermission } from "@/lib/rbac";

// GM-aligned ContactAllocationUpdate counts (exclude bulk allocation only).
// Grouped by merchantId. Optional `from` / `to` filter by Colombo createdAt.

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["contacts.allocation.read", "contacts.read"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (fromParam && Number.isNaN(Date.parse(`${fromParam}T00:00:00+05:30`))) {
    return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  }
  if (toParam && Number.isNaN(Date.parse(`${toParam}T23:59:59.999+05:30`))) {
    return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
  }

  const data = await fetchCallCenterPerformanceRows({
    companyId,
    fromYmd: fromParam,
    toYmd: toParam,
  });

  return NextResponse.json({ data });
}
