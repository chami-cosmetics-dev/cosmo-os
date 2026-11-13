import { NextRequest, NextResponse } from "next/server";

import { validateDraftForGenerate } from "@/lib/osf/supplier-orders-allocate";
import type { WorkingOrderRow } from "@/lib/osf/supplier-orders-draft";
import {
  pushOsfDraftToSupplierPortal,
  SupplierPortalPushError,
} from "@/lib/osf/supplier-orders-portal-push";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { osfSupplierOrdersSendBodySchema } from "@/lib/validation/osf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function canUseSupplierOrders(
  context: NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>,
) {
  return (
    hasPermission(context, "purchasing.osf.read") ||
    hasPermission(context, "purchasing.osf.manage") ||
    hasPermission(context, "purchasing.tools.read") ||
    hasPermission(context, "purchasing.tools.manage")
  );
}

/**
 * Phase G: Send OSF supplier-orders draft to Supplier Portal as cosmo-osf-push.v1.
 * Does not clear the localStorage draft. Does not create Portal SupplierRequests.
 */
export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseSupplierOrders(context)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!context.user.companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = osfSupplierOrdersSendBodySchema.safeParse(body);
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
    const result = await pushOsfDraftToSupplierPortal({
      companyId: context.user.companyId,
      actorUserId: context.user.id,
      actorEmail: context.user.email,
      rows,
      brandFilterVendorId: parsed.data.vendorId,
      priorityFilter: parsed.data.priority,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return NextResponse.json(result, { status: result.replay ? 200 : 201 });
  } catch (err) {
    if (err instanceof SupplierPortalPushError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: err.status },
      );
    }
    console.error("[osf supplier-orders/send]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 },
    );
  }
}
