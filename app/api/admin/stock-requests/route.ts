import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import { listStockRequests } from "@/lib/wishlist-buddy/requests";
import { stockRequestListQuerySchema } from "@/lib/wishlist-buddy/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("stock_requests.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const parsed = stockRequestListQuerySchema.safeParse({
    status: sp.get("status") || undefined,
    search: sp.get("search") || undefined,
    page: sp.get("page") || undefined,
    limit: sp.get("limit") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }

  const data = await listStockRequests({ companyId, ...parsed.data });
  return NextResponse.json(data);
}
