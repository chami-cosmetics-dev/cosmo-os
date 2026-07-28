import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { quickSearchOrders } from "@/lib/page-data/orders-quick-search";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const querySchema = z.object({
  q: trimmedString(2, LIMITS.orderRemarkContent.max),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }

  const orders = await quickSearchOrders({
    companyId,
    q: parsed.data.q,
    limit: parsed.data.limit,
  });

  return NextResponse.json({ orders });
}
