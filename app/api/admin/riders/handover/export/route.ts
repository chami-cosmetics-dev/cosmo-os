import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveViewerFinanceLocationIds } from "@/lib/approval-workflow";
import { loadHandoverStatusExport } from "@/lib/rider-handover";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string(),
  to: z.string(),
  riderId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission("riders.handover.export");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user?.companyId;
  const userId = auth.context!.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const riderRaw = request.nextUrl.searchParams.get("riderId") ?? "";
  const parsed = querySchema.safeParse({
    from: request.nextUrl.searchParams.get("from") ?? "",
    to: request.nextUrl.searchParams.get("to") ?? "",
    riderId: riderRaw || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  const riderId = parsed.data.riderId ? cuidSchema.safeParse(parsed.data.riderId) : null;
  if (riderId && !riderId.success) {
    return NextResponse.json({ error: "Invalid rider" }, { status: 400 });
  }

  const locationIds = await resolveViewerFinanceLocationIds(userId, companyId, auth.context!.roleNames);
  const exported = await loadHandoverStatusExport({
    companyId,
    fromYmd: parsed.data.from,
    toYmd: parsed.data.to,
    riderId: riderId?.success ? riderId.data : null,
    locationIds,
  });
  if (!exported.ok) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const filename = `handover-status-${parsed.data.from}-to-${parsed.data.to}.csv`;
  return new NextResponse(exported.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
