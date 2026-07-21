import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import { cuidSchema, abandonedOrderFollowUpPatchBodySchema } from "@/lib/validation";
import { updateAbandonedCheckoutFollowUp } from "@/lib/abandoned-checkout-follow-up";
import { createPerfLogger } from "@/lib/perf";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const perf = createPerfLogger("api.admin.abandoned-orders.follow-up.PATCH", {
    path: request.nextUrl.pathname,
  });

  const auth = await requirePermission("abandoned_orders.manage");
  if (!auth.ok) {
    perf.end({ status: auth.status, ok: false });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId;
  const actorUserId = auth.context!.user?.id;
  if (!companyId || !actorUserId) {
    perf.end({ status: 404, ok: false });
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id: rawId } = await params;
  const idResult = cuidSchema.safeParse(rawId);
  if (!idResult.success) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const bodyJson = await request.json().catch(() => null);
  if (bodyJson === null) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bodyResult = abandonedOrderFollowUpPatchBodySchema.safeParse(bodyJson);
  if (!bodyResult.success) {
    perf.end({ status: 400, ok: false });
    return NextResponse.json(
      { error: bodyResult.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  try {
    const result = await updateAbandonedCheckoutFollowUp({
      id: idResult.data,
      companyId,
      actorUserId,
      body: bodyResult.data,
    });

    perf.end({ status: 200, ok: true });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "Not found" ? 404 : 400;
    perf.end({ status, ok: false });
    return NextResponse.json({ error: message }, { status });
  }
}
