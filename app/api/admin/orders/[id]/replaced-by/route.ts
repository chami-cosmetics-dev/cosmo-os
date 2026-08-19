import { NextRequest, NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { OrderReplaceLinkError, setOrderReplacedBy } from "@/lib/order-replace-link";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { replacedByOrderBodySchema } from "@/lib/validation/order-replace-link";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (isVaultOsDeployment()) {
    return NextResponse.json(
      { error: "Order replace link is only available in Cosmo OS" },
      { status: 403 }
    );
  }

  const auth = await requirePermission("orders.cancel");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = auth.context!.user!;
  const companyId = user.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = replacedByOrderBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const order = await setOrderReplacedBy({
      companyId,
      sourceOrderId: idResult.data,
      replacedByOrderNumber: parsed.data.replacedByOrderNumber,
    });

    await writeAuditLog({
      companyId,
      actorUserId: user.id,
      action: "order_replace_link_updated",
      module: "orders",
      entityType: "Order",
      entityId: order.id,
      summary:
        parsed.data.replacedByOrderNumber === null
          ? `Cleared replacement link on ${order.orderLabel}`
          : `Set replacement link on ${order.orderLabel} → ${order.replacedByOrder?.orderLabel ?? parsed.data.replacedByOrderNumber}`,
      metadata: {
        replacedByOrderNumber: parsed.data.replacedByOrderNumber,
        replacedByOrderId: order.replacedByOrder?.id ?? null,
        replacedByOrderLabel: order.replacedByOrder?.orderLabel ?? null,
      },
    });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderReplaceLinkError) {
      const status = error.code === "source_not_found" ? 404 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("replaced-by PATCH failed:", error);
    return NextResponse.json({ error: "Failed to update replace link" }, { status: 500 });
  }
}
