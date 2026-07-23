import { NextRequest, NextResponse } from "next/server";

import { rematchUnmatchedWaybills } from "@/lib/order-waybills";
import { requireAnyPermission } from "@/lib/rbac";
import { waybillRematchBodySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const parsed = waybillRematchBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rematch parameters." }, { status: 400 });
  }

  const summary = await rematchUnmatchedWaybills(companyId, { limit: parsed.data.limit });
  return NextResponse.json(summary);
}
