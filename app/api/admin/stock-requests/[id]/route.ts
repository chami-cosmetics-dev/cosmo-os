import { NextRequest, NextResponse } from "next/server";

import { cuidSchema } from "@/lib/validation";
import { updateStockRequest } from "@/lib/wishlist-buddy/requests";
import { requireStockRequestViewer, stockRequestErrorResponse } from "@/lib/wishlist-buddy/route-auth";
import { stockRequestPatchBodySchema } from "@/lib/wishlist-buddy/validation";

export const dynamic = "force-dynamic";

/** Website requests need stock_requests.manage; staff requests can be updated by their creator. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStockRequestViewer(["stock_requests.manage", "stock_requests.create"]);
  if (!auth.ok) return auth.response;

  const idResult = cuidSchema.safeParse((await params).id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const bodyResult = stockRequestPatchBodySchema.safeParse(await request.json().catch(() => null));
  if (!bodyResult.success) {
    return NextResponse.json({ error: bodyResult.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  try {
    const item = await updateStockRequest({
      id: idResult.data,
      companyId: auth.companyId,
      viewer: auth.viewer,
      body: bodyResult.data,
    });
    return NextResponse.json({ item });
  } catch (error) {
    return stockRequestErrorResponse(error);
  }
}
