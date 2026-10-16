import { NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { markShopItemRequestDone } from "@/lib/material-transfer/shop-item-request-store";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const parsed = cuidSchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const userId = auth.context.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const request = await markShopItemRequestDone({
      companyId: auth.companyId,
      id: parsed.data,
      userId,
    });
    return NextResponse.json({ request });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shop-requests/done]", error);
    return NextResponse.json({ error: "Could not mark the request done" }, { status: 500 });
  }
}
