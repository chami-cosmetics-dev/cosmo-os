import { NextRequest, NextResponse } from "next/server";

import { validateDraftForGenerate } from "@/lib/osf/supplier-orders-allocate";
import { buildSupplierOrdersZipBuffer } from "@/lib/osf/supplier-orders-export";
import type { WorkingOrderRow } from "@/lib/osf/supplier-orders-draft";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { osfSupplierOrdersGenerateBodySchema } from "@/lib/validation/osf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function canUseSupplierOrders(context: NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>) {
  return (
    hasPermission(context, "purchasing.osf.read") ||
    hasPermission(context, "purchasing.osf.manage") ||
    hasPermission(context, "purchasing.tools.read") ||
    hasPermission(context, "purchasing.tools.manage")
  );
}

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseSupplierOrders(context)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!context.user.companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = osfSupplierOrdersGenerateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const rows: WorkingOrderRow[] = parsed.data.rows.map((row) => ({
    sku: row.sku,
    description: row.description,
    reorderQty: row.reorderQty,
    allocations: row.allocations.map((a) => ({
      supplierId: a.supplierId,
      supplierName: a.supplierName,
      qty: a.qty,
    })),
  }));

  const validation = validateDraftForGenerate(rows);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error, skus: validation.skus },
      { status: 400 },
    );
  }

  try {
    const { buffer, filename } = await buildSupplierOrdersZipBuffer(rows);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[osf supplier-orders/generate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generate failed" },
      { status: 500 },
    );
  }
}
