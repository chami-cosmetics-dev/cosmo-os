import { NextResponse } from "next/server";

import { listCitypakApiWaybillBatches } from "@/lib/order-waybills";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAnyPermission([
    "fulfillment.ready_dispatch.read",
    "fulfillment.ready_dispatch.dispatch",
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

  const batches = await listCitypakApiWaybillBatches(companyId);
  return NextResponse.json({ batches });
}
