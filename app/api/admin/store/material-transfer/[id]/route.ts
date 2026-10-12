import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { getMaterialTransfer } from "@/lib/material-transfer/receipts";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await context.params;
  const parsed = cuidSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transfer" }, { status: 400 });
  }

  try {
    const transfer = await getMaterialTransfer({
      companyId: auth.companyId,
      id: parsed.data,
      seeAll: auth.canWrite,
      canReceive: auth.canReceive,
      scope: auth.scope,
    });
    return NextResponse.json({ transfer });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/detail]", error);
    return NextResponse.json({ error: "Could not load the transfer" }, { status: 500 });
  }
}
