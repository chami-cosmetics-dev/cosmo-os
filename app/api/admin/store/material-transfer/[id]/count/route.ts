import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { countReceivedItem } from "@/lib/material-transfer/receipts";
import { cuidSchema } from "@/lib/validation";
import { materialTransferCountSchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!auth.canReceive) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid transfer" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = materialTransferCountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const transfer = await countReceivedItem({
      companyId: auth.companyId,
      id: idParsed.data,
      scope: auth.scope,
      canReceive: auth.canReceive,
      code: parsed.data.code,
      itemCode: parsed.data.itemCode,
      qty: parsed.data.qty,
    });
    return NextResponse.json({ transfer });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/count]", error);
    return NextResponse.json({ error: "Could not update the received qty" }, { status: 500 });
  }
}
