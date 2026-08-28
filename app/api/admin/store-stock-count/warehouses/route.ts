import { NextRequest, NextResponse } from "next/server";

import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import { listErpWarehousesForCompany, StoreStockCountErpError } from "@/lib/store-stock-count/erp";
import { storeStockCountItemsBodySchema } from "@/lib/validation/store-stock-count";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = storeStockCountItemsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const warehouses = await listErpWarehousesForCompany({
      companyId: auth.companyId,
      instanceId: parsed.data.instanceId,
      erpCompany: parsed.data.erpCompany,
    });
    return NextResponse.json({ warehouses });
  } catch (err) {
    const status = err instanceof StoreStockCountErpError ? err.status : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load warehouses" },
      { status },
    );
  }
}
