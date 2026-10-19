import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { lookupShopRequestItem } from "@/lib/material-transfer/shop-item-request-lookup";
import { shopItemRequestLookupSchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.canWrite && !auth.canReceive) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = shopItemRequestLookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await lookupShopRequestItem(auth.companyId, parsed.data.code);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shop-requests/lookup]", error);
    return NextResponse.json({ error: "Could not look up the item" }, { status: 502 });
  }
}
