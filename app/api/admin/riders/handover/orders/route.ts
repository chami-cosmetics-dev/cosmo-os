import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildHandoverOrders, loadRiderHandoverDeliveries, pageHandoverDeliveries } from "@/lib/rider-handover";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  riderId: cuidSchema,
  from: z.string(),
  to: z.string(),
  page: z.coerce.number().int().min(1).optional(),
  q: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission("riders.handover.receive");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = querySchema.safeParse({
    riderId: request.nextUrl.searchParams.get("riderId") ?? "",
    from: request.nextUrl.searchParams.get("from") ?? "",
    to: request.nextUrl.searchParams.get("to") ?? "",
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const loaded = await loadRiderHandoverDeliveries({
    companyId,
    riderId: parsed.data.riderId,
    fromYmd: parsed.data.from,
    toYmd: parsed.data.to,
  });
  if (!loaded.ok) {
    if (loaded.error === "rider_not_found") {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const paged = pageHandoverDeliveries(loaded.deliveries, {
    query: parsed.data.q,
    page: parsed.data.page,
  });
  const orders = await buildHandoverOrders(paged.deliveries);
  return NextResponse.json({
    riderId: loaded.riderId,
    riderName: loaded.riderName,
    from: parsed.data.from,
    to: parsed.data.to,
    page: paged.page,
    pageSize: paged.pageSize,
    total: paged.total,
    pageCount: paged.pageCount,
    orders,
  });
}
