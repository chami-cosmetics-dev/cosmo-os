import { NextResponse } from "next/server";

import { requireMaterialTransferAccess } from "@/lib/material-transfer/auth";
import { erpErrorMessage } from "@/lib/material-transfer/erp-error";
import { listTransferWarehouses, resolveTransferSlots } from "@/lib/material-transfer/erp";
import type { OsfErpInstance } from "@/lib/osf/erp-stock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadSlot(instance: OsfErpInstance | null) {
  if (!instance) {
    return { configured: false as const, label: null, warehouses: [], error: null };
  }
  try {
    const warehouses = await listTransferWarehouses(instance.cfg);
    return {
      configured: true as const,
      label: instance.label,
      warehouses,
      error: null,
    };
  } catch (error) {
    console.error("[material-transfer/page-data]", instance.label, error);
    return {
      configured: true as const,
      label: instance.label,
      warehouses: [],
      error: erpErrorMessage(error),
    };
  }
}

export async function GET() {
  const auth = await requireMaterialTransferAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const slots = await resolveTransferSlots(auth.companyId);
  const [erp1, erp2] = await Promise.all([loadSlot(slots.erp1), loadSlot(slots.erp2)]);
  return NextResponse.json({ erp1, erp2 });
}
