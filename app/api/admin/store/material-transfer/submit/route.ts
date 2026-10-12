import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { requireMaterialTransferAccess } from "@/lib/material-transfer/auth";
import { recordSentTransfer } from "@/lib/material-transfer/receipts";
import { erpErrorMessage } from "@/lib/material-transfer/erp-error";
import {
  listTransferWarehouses,
  MaterialTransferError,
  resolveTransferSlots,
  submitMaterialTransfer,
} from "@/lib/material-transfer/erp";
import { materialTransferSubmitSchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireMaterialTransferAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = materialTransferSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const slots = await resolveTransferSlots(auth.companyId);
    const instance = parsed.data.slot === "erp1" ? slots.erp1 : slots.erp2;
    if (!instance) {
      throw new MaterialTransferError(
        parsed.data.slot === "erp1" ? "ERP1 is not configured" : "ERP2 is not configured",
      );
    }
    const warehouses = await listTransferWarehouses(instance.cfg);
    const result = await submitMaterialTransfer({
      cfg: instance.cfg,
      slot: parsed.data.slot,
      company: parsed.data.company,
      sourceWarehouse: parsed.data.sourceWarehouse,
      targetWarehouse: parsed.data.targetWarehouse,
      lines: parsed.data.lines,
      warehouses,
    });

    let receiptId: string | null = null;
    let receiptError: string | null = null;
    try {
      const saved = await recordSentTransfer({
        companyId: auth.companyId,
        slot: parsed.data.slot,
        erpName: result.name,
        erpCompany: result.company,
        sourceWarehouse: parsed.data.sourceWarehouse,
        targetWarehouse: parsed.data.targetWarehouse,
        createdByUserId: auth.context.user?.id ?? null,
        lines: parsed.data.lines,
      });
      receiptId = saved.id;
    } catch (error) {
      console.error("[material-transfer/submit] receipt", error);
      receiptError = "Stock moved in ERP. The shop receipt list could not be saved.";
    }

    await writeAuditLog({
      companyId: auth.companyId,
      actorUserId: auth.context.user?.id,
      module: "material-transfer",
      action: "material_transfer_submitted",
      entityType: "Stock Entry",
      entityId: result.name,
      summary: `Submitted ${result.name} ${parsed.data.sourceWarehouse} → ${parsed.data.targetWarehouse}`,
      afterData: {
        name: result.name,
        slot: parsed.data.slot,
        company: result.company,
        sourceWarehouse: parsed.data.sourceWarehouse,
        targetWarehouse: parsed.data.targetWarehouse,
        lines: parsed.data.lines,
      },
    });

    return NextResponse.json({ ...result, receiptId, receiptError });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/submit]", error);
    return NextResponse.json({ error: erpErrorMessage(error) }, { status: 502 });
  }
}
