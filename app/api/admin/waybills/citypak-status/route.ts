import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  CITYPAK_STATUS_BULK_MAX_LIMIT,
  refreshCitypakWaybillStatusesByIds,
} from "@/lib/citypak-waybill-status";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidOrUuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  waybillIds: z.array(cuidOrUuidSchema).min(1).max(CITYPAK_STATUS_BULK_MAX_LIMIT),
  /** Re-poll delivered / returned waybills too. Off by default. */
  includeTerminal: z.boolean().optional(),
});

/** Refresh CityPak delivery status for many waybills in one go (the "Check all statuses" button). */
export async function POST(request: NextRequest) {
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Select CityPak waybills to check." },
      { status: 400 }
    );
  }

  const result = await refreshCitypakWaybillStatusesByIds({
    companyId,
    waybillIds: parsed.data.waybillIds,
    includeTerminal: parsed.data.includeTerminal,
  });

  return NextResponse.json(result);
}
