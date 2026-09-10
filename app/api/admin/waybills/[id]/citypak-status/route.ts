import { NextRequest, NextResponse } from "next/server";

import { refreshCitypakWaybillStatus } from "@/lib/citypak-waybill-status";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidOrUuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAnyPermission([
    "fulfillment.ready_dispatch.read",
    "fulfillment.ready_dispatch.dispatch",
    "fulfillment.waybill_lookup.read",
    "fulfillment.waybill_lookup.import",
  ]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id } = await context.params;
  const parsed = cuidOrUuidSchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid waybill id" }, { status: 400 });

  const result = await refreshCitypakWaybillStatus({ companyId, waybillId: parsed.data });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
