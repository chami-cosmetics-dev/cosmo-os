import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferAccess } from "@/lib/material-transfer/auth";
import { erpErrorMessage } from "@/lib/material-transfer/erp-error";
import {
  listTransferWarehouses,
  lookupTransferItem,
  MaterialTransferError,
  resolveTransferSlots,
} from "@/lib/material-transfer/erp";
import { materialTransferLookupSchema } from "@/lib/validation/material-transfer";

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
  const parsed = materialTransferLookupSchema.safeParse(body);
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
    const item = await lookupTransferItem({
      cfg: instance.cfg,
      slot: parsed.data.slot,
      code: parsed.data.code,
      sourceWarehouse: parsed.data.sourceWarehouse,
      company: parsed.data.company,
      warehouses,
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof MaterialTransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[material-transfer/lookup]", error);
    return NextResponse.json({ error: erpErrorMessage(error) }, { status: 502 });
  }
}
