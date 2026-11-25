import { NextRequest, NextResponse } from "next/server";

import { validateDraftForGenerate } from "@/lib/osf/supplier-orders-allocate";
import type { WorkingOrderRow } from "@/lib/osf/supplier-orders-draft";
import {
  prepareOsfPortalPush,
  pushPreparedOsfToSupplierPortal,
  SupplierPortalPushError,
} from "@/lib/osf/supplier-orders-portal-push";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { osfSupplierOrdersRetryBodySchema, osfSupplierOrdersSendBodySchema } from "@/lib/validation/osf";

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
  const actor = { companyId: context.user.companyId, actorUserId: context.user.id };
  try {
    if (body && typeof body === "object" && "retryTicket" in body) {
      const retry = osfSupplierOrdersRetryBodySchema.safeParse(body);
      if (!retry.success) {
        return NextResponse.json({ error: "Invalid retry record" }, { status: 400 });
      }
      const result = await pushPreparedOsfToSupplierPortal(retry.data.retryTicket, actor);
      return NextResponse.json(result, { status: result.replay ? 200 : 201 });
    }

    const parsed = osfSupplierOrdersSendBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() }, { status: 400 },
      );
    }

    const rows: WorkingOrderRow[] = parsed.data.rows;
    const validation = validateDraftForGenerate(rows);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, skus: validation.skus }, { status: 400 },
      );
    }
    const retryTicket = await prepareOsfPortalPush({
      ...actor,
      actorEmail: context.user.email,
      rows,
      brandFilterVendorId: parsed.data.vendorId,
      priorityFilter: parsed.data.priority,
    });
    return NextResponse.json({ retryTicket }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SupplierPortalPushError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: "Supplier Portal transfer failed" },
      { status: 500 },
    );
  }
}
