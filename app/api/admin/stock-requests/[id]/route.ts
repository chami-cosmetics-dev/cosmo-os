import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { updateStockRequest } from "@/lib/wishlist-buddy/requests";
import { stockRequestPatchBodySchema } from "@/lib/wishlist-buddy/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("stock_requests.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user?.companyId;
  const actorUserId = auth.context!.user?.id;
  if (!companyId || !actorUserId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const idResult = cuidSchema.safeParse((await params).id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const bodyResult = stockRequestPatchBodySchema.safeParse(await request.json().catch(() => null));
  if (!bodyResult.success) {
    return NextResponse.json({ error: bodyResult.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  try {
    const item = await updateStockRequest({ id: idResult.data, companyId, actorUserId, body: bodyResult.data });
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: message === "Not found" ? 404 : 400 });
  }
}
