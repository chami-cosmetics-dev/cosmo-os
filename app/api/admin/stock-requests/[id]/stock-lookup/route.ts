import { NextRequest, NextResponse } from "next/server";

import { cuidSchema } from "@/lib/validation";
import { refreshStockLookup } from "@/lib/wishlist-buddy/requests";
import { requireStockRequestViewer, stockRequestErrorResponse } from "@/lib/wishlist-buddy/route-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Re-check ERP stock for one request (no customer email). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStockRequestViewer(["stock_requests.read", "stock_requests.create"]);
  if (!auth.ok) return auth.response;

  const idResult = cuidSchema.safeParse((await params).id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const item = await refreshStockLookup({ id: idResult.data, companyId: auth.companyId, viewer: auth.viewer });
    return NextResponse.json({ item });
  } catch (error) {
    return stockRequestErrorResponse(error);
  }
}
