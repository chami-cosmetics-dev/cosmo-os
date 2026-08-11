import { NextRequest, NextResponse } from "next/server";

import { getWaybillLookupPageData } from "@/lib/order-waybills";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";
import { waybillLookupPageDataQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission([
    "fulfillment.waybill_lookup.read",
    "fulfillment.waybill_lookup.import",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = waybillLookupPageDataQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    rematch: request.nextUrl.searchParams.get("rematch") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pagination or rematch parameters." }, { status: 400 });
  }

  const canImport = hasPermission(auth.context, "fulfillment.waybill_lookup.import");
  // Page open is read-only. Rematch only when rematch=1 (or via POST /rematch / after import flows).
  const data = await getWaybillLookupPageData({
    companyId,
    page: parsed.data.page,
    limit: parsed.data.limit,
    canImport,
    rematch: parsed.data.rematch === true,
  });

  return NextResponse.json(data);
}
