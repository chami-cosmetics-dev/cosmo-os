import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { refreshStockLookup } from "@/lib/wishlist-buddy/requests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Re-check ERP stock for one request (no customer email). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("stock_requests.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const idResult = cuidSchema.safeParse((await params).id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const item = await refreshStockLookup({ id: idResult.data, companyId });
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: message === "Not found" ? 404 : 500 });
  }
}
