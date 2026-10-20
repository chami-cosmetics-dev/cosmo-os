import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { suggestShopRequestItems } from "@/lib/material-transfer/shop-item-request-lookup";
import { shopItemRequestSuggestQuerySchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.canWrite && !auth.canReceive) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = shopItemRequestSuggestQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const q = parsed.data.q?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });

  try {
    const hits = await suggestShopRequestItems(auth.companyId, q);
    return NextResponse.json({ hits });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shop-requests/suggest]", error);
    return NextResponse.json({ error: "Could not search items" }, { status: 502 });
  }
}
