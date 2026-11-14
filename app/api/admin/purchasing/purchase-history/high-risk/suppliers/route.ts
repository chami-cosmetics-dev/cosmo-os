import { ItemCreationErp } from "@prisma/client";
import { NextResponse } from "next/server";

import { getItemCreationStockOptions } from "@/lib/item-creation/automation";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(context, "purchasing.high_risk.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await Promise.allSettled([
    getItemCreationStockOptions(context, ItemCreationErp.ERP1, { allowStoreAllocation: true }),
    getItemCreationStockOptions(context, ItemCreationErp.ERP2, { allowStoreAllocation: true }),
  ]);
  const suppliers = new Map<string, { name: string; label: string }>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const supplier of result.value.suppliers) {
      if (!suppliers.has(supplier.name)) suppliers.set(supplier.name, supplier);
    }
  }
  if (suppliers.size === 0) {
    const error = results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load ERP suppliers" }, { status: 502 });
  }
  return NextResponse.json({ suppliers: [...suppliers.values()].sort((a, b) => a.label.localeCompare(b.label)) });
}
