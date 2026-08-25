import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { OsfErpError } from "@/lib/osf/erp-stock";
import { fetchSkuColumnLiveStock } from "@/lib/osf/sku-column-stock";
import { requirePermission } from "@/lib/rbac";

const skuParamSchema = z.string().trim().min(1).max(100);

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sku: string }> },
) {
  const auth = await requirePermission("purchasing.osf.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { sku: rawSku } = await context.params;
  const skuParsed = skuParamSchema.safeParse(decodeURIComponent(rawSku));
  if (!skuParsed.success) {
    return NextResponse.json({ error: "Invalid SKU" }, { status: 400 });
  }
  const sku = skuParsed.data;

  try {
    const columns = await fetchSkuColumnLiveStock(companyId, sku);
    const stock: Record<string, number | null> = {};
    const reorderQty: Record<string, number | null> = {};
    for (const col of columns) {
      stock[col.key] = col.stock;
      reorderQty[col.key] = col.reorderQty;
    }
    return NextResponse.json({ sku, columns, stock, reorderQty });
  } catch (err) {
    if (err instanceof OsfErpError) {
      return NextResponse.json(
        { error: "ERP unreachable", code: "ERP_UNAVAILABLE", detail: err.message },
        { status: 502 },
      );
    }
    console.error("[OSF profile stock]", err);
    return NextResponse.json({ error: "Failed to load live stock" }, { status: 500 });
  }
}
