import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { getShopItemRequest } from "@/lib/material-transfer/shop-item-request-store";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const parsed = cuidSchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const request = await getShopItemRequest({
      companyId: auth.companyId,
      id: parsed.data,
      canWrite: auth.canWrite,
      outletName: auth.scope.outletName,
    });
    return NextResponse.json({ request });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shop-requests/id]", error);
    return NextResponse.json({ error: "Could not load the request" }, { status: 500 });
  }
}
