import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { getDeliveryUrl, sendOrderSms } from "@/lib/order-sms";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("orders.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  const companyId = user?.companyId ?? null;
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

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    include: {
      companyLocation: { select: { name: true } },
      dispatchedByRider: { select: { name: true, mobile: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.fulfillmentStage !== "dispatched") {
    return NextResponse.json(
      { error: "Re-send rider SMS is only available for dispatched orders" },
      { status: 400 }
    );
  }

  if (!order.dispatchedByRiderId || !order.dispatchedByRider) {
    return NextResponse.json(
      { error: "Re-send rider SMS is only available when order was dispatched to a rider" },
      { status: 400 }
    );
  }

  const rider = order.dispatchedByRider;
  const riderPhone = rider.mobile?.trim();
  if (!riderPhone) {
    return NextResponse.json(
      { error: "Rider has no phone number configured" },
      { status: 400 }
    );
  }

  const orderNum = order.orderNumber ?? order.name ?? order.shopifyOrderId;
  const deliveryUrl = getDeliveryUrl(order);

  try {
    await sendOrderSms(companyId, order.id, "rider_dispatched", {
      orderNumber: orderNum,
      riderName: rider.name ?? undefined,
      riderPhone,
      deliveryUrl,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Resend rider SMS] failed:", err);
    return NextResponse.json(
      { error: "Failed to send rider SMS" },
      { status: 500 }
    );
  }
}
