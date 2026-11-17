import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferAccess } from "@/lib/material-transfer/auth";
import { erpErrorMessage } from "@/lib/material-transfer/erp-error";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { recoverAndRecordSentTransfer } from "@/lib/material-transfer/reconcile-sent";
import { materialTransferSubmitSchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Attach an ERP Stock Entry that already exists to Cosmo History (no new ERP post). */
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
    const result = await recoverAndRecordSentTransfer({
      companyId: auth.companyId,
      slot: parsed.data.slot,
      company: parsed.data.company,
      sourceWarehouse: parsed.data.sourceWarehouse,
      targetWarehouse: parsed.data.targetWarehouse,
      createdByUserId: auth.context.user?.id ?? null,
      ownerUser: auth.context.user ?? {},
      lines: parsed.data.lines,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/recover]", error);
    return NextResponse.json({ error: erpErrorMessage(error) }, { status: 502 });
  }
}
