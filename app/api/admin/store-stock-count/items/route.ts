import { NextRequest, NextResponse } from "next/server";

import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import {
  fetchCompanyStockItems,
  StoreStockCountErpError,
} from "@/lib/store-stock-count/erp";
import { storeStockCountItemsBodySchema } from "@/lib/validation/store-stock-count";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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

  const { instanceId, erpCompany } = parsed.data;

  try {
    const result = await fetchCompanyStockItems({
      companyId: auth.companyId,
      instanceId,
      erpCompany,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StoreStockCountErpError) {
      return NextResponse.json(
        {
          error: err.message,
          instanceId,
          erpCompany,
        },
        { status: err.status },
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "ERP request failed",
        instanceId,
        erpCompany,
      },
      { status: 502 },
    );
  }
}
