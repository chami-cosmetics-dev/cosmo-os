import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { applyFinanceCollectionPaymentMethod } from "@/lib/apply-collection-payment-method";
import { financeMopKeyToCollectionTarget } from "@/lib/collection-payment-method";
import { isAllowedCompanyErpPaymentMode } from "@/lib/erp-payment-modes";
import { buildHandoverOrders, loadScopedRiderHandoverDeliveries } from "@/lib/rider-handover";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, trimmedString } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  riderId: cuidSchema,
  from: z.string(),
  to: z.string(),
  orderId: cuidSchema,
  modeOfPayment: trimmedString(1, 200),
});

export async function POST(request: NextRequest) {
  const auth = await requirePermission("riders.handover.receive");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user?.companyId;
  const userId = auth.context!.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
  }

  const loaded = await loadScopedRiderHandoverDeliveries({
    companyId,
    userId,
    roleNames: auth.context!.roleNames,
    riderId: parsed.data.riderId,
    fromYmd: parsed.data.from,
    toYmd: parsed.data.to,
  });
  if (!loaded.ok) {
    if (loaded.error === "rider_not_found") {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const orders = await buildHandoverOrders(loaded.deliveries);
  const order = orders.find((row) => row.orderId === parsed.data.orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found for this rider" }, { status: 404 });
  }
  if (order.invoiceClosed || order.financeApprovalPending) {
    return NextResponse.json({ error: "This order cannot change payment type now" }, { status: 400 });
  }
  if (!isAllowedCompanyErpPaymentMode(order.modes, parsed.data.modeOfPayment)) {
    return NextResponse.json({ error: "Invalid ERP payment mode" }, { status: 400 });
  }

  const mopKey = order.modes.find((mode) => mode.mopName === parsed.data.modeOfPayment)?.key ?? null;
  const target = financeMopKeyToCollectionTarget(mopKey);
  if (target !== "cash" && target !== "card_on_delivery") {
    return NextResponse.json({ ok: true, persisted: false });
  }

  await applyFinanceCollectionPaymentMethod({
    orderId: order.orderId,
    target,
  });
  return NextResponse.json({ ok: true, persisted: true });
}
