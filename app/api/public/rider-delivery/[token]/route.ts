import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendOrderSms } from "@/lib/order-sms";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { riderDeliveryToken: token },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      fulfillmentStage: true,
      deliveryCompleteAt: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (order.fulfillmentStage === "delivery_complete") {
    return NextResponse.json({
      orderName: order.name ?? order.orderNumber ?? order.shopifyOrderId,
      message: "Delivery already confirmed",
    });
  }

  return NextResponse.json({
    orderName: order.name ?? order.orderNumber ?? order.shopifyOrderId,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const confirmed = body.confirmed === true;

  const order = await prisma.order.findFirst({
    where: { riderDeliveryToken: token },
    include: { company: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (order.fulfillmentStage === "delivery_complete") {
    return NextResponse.json({ success: true, message: "Already confirmed" });
  }

  const now = new Date();

  if (confirmed) {
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        fulfillmentStage: "delivery_complete",
        deliveryCompleteAt: now,
        riderDeliveryToken: null,
      },
      include: { companyLocation: true },
    });
    sendOrderSms(updated.companyId, updated.id, "delivery_complete", {
      orderNumber: updated.orderNumber ?? updated.name ?? updated.shopifyOrderId,
      customerPhone: updated.customerPhone ?? undefined,
      locationName: updated.companyLocation?.name ?? undefined,
    }).catch((err) => console.error("[Rider delivery] SMS failed:", err));
  }

  return NextResponse.json({ success: true });
}
