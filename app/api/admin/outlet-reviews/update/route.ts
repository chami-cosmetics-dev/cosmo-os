import { NextRequest, NextResponse } from "next/server";

import { getUserOutlets, upsertOutletReview } from "@/lib/outlet-utils";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";

export async function PUT(request: NextRequest) {
  const auth = await requireAnyPermission(["outlets.read.all", "outlets.read.assigned"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  const viewerUserId = auth.context.user?.id ?? null;
  if (!companyId || !viewerUserId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as {
    orderId?: unknown;
    outletId?: unknown;
    reviewRequested?: unknown;
    reviewCollected?: unknown;
  };

  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const outletId = typeof body.outletId === "string" ? body.outletId : "";
  if (!orderId || !outletId) {
    return NextResponse.json({ error: "orderId and outletId are required" }, { status: 400 });
  }

  const canReadAll = hasPermission(auth.context, "outlets.read.all");

  // For assigned-only users, verify they have access to this outlet
  if (!canReadAll) {
    const userOutlets = await getUserOutlets(viewerUserId, companyId);
    const hasAccess = userOutlets.some((o) => o.id === outletId);
    if (!hasAccess) {
      return NextResponse.json({ error: "You do not have access to this outlet" }, { status: 403 });
    }
  }

  try {
    await upsertOutletReview({
      outletId,
      orderId,
      reviewRequested: typeof body.reviewRequested === "string" ? body.reviewRequested : undefined,
      reviewCollected: typeof body.reviewCollected === "string" ? body.reviewCollected : undefined,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to save review";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
