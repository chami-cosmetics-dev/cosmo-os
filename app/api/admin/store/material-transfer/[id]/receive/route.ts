import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { markTransferReceived } from "@/lib/material-transfer/receipts";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
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

  try {
    const transfer = await markTransferReceived({
      companyId: auth.companyId,
      id: idParsed.data,
      userId: auth.context.user?.id ?? "",
      scope: auth.scope,
      canReceive: auth.canReceive,
    });
    await writeAuditLog({
      companyId: auth.companyId,
      actorUserId: auth.context.user?.id,
      module: "material-transfer",
      action: "material_transfer_received",
      entityType: "MaterialTransfer",
      entityId: transfer.id,
      summary: `Shop marked ${transfer.erpName} received`,
      afterData: {
        erpName: transfer.erpName,
        targetWarehouse: transfer.targetWarehouse,
        sentQty: transfer.sentQty,
        receivedQty: transfer.receivedQty,
        mismatchCount: transfer.mismatchCount,
      },
    });
    return NextResponse.json({ transfer });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/receive]", error);
    return NextResponse.json({ error: "Could not mark the transfer received" }, { status: 500 });
  }
}
