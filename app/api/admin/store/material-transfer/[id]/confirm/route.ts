import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { requireMaterialTransferAccess } from "@/lib/material-transfer/auth";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { confirmShopReturn } from "@/lib/material-transfer/receipts";
import { cuidSchema } from "@/lib/validation";
import { materialTransferConfirmSchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireMaterialTransferAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: "Invalid transfer" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = materialTransferConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = auth.context.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const transfer = await confirmShopReturn({
      companyId: auth.companyId,
      id: idParsed.data,
      userId,
      lines: parsed.data.lines,
    });
    await writeAuditLog({
      companyId: auth.companyId,
      actorUserId: userId,
      module: "material-transfer",
      action: "material_transfer_confirmed",
      entityType: "MaterialTransfer",
      entityId: transfer.id,
      summary: `Stores confirmed ${transfer.erpName ?? "shop return"}`,
      afterData: {
        erpName: transfer.erpName,
        sourceWarehouse: transfer.sourceWarehouse,
        targetWarehouse: transfer.targetWarehouse,
        sentQty: transfer.sentQty,
        receivedQty: transfer.receivedQty,
      },
    });
    return NextResponse.json({ transfer });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/confirm]", error);
    return NextResponse.json({ error: "Could not confirm the shop return" }, { status: 500 });
  }
}
