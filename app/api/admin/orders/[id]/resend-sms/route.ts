import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  getDeliveryUrl,
  resolveCustomerPhone,
  resolveOrderInvoiceNumber,
  resolveOrderNumber,
} from "@/lib/order-sms-resolvers";
import { sendOrderSms, type SmsTrigger } from "@/lib/order-sms";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const bodySchema = z.object({
  trigger: z.enum(["package_ready", "dispatched", "delivery_complete", "rider_dispatched"]),
});

const DISPATCHED_OR_LATER = new Set([
  "dispatched",
  "delivery_complete",
  "invoice_complete",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
      { status: 404 },
    );
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid trigger" }, { status: 400 });
  }

  const trigger = parsed.data.trigger as SmsTrigger;

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      erpnextInvoiceId: true,
      fulfillmentStage: true,
      customerPhone: true,
      shippingAddress: true,
      packageReadyAt: true,
      dispatchedAt: true,
      deliveryCompleteAt: true,
      dispatchedByRiderId: true,
      riderDeliveryToken: true,
      dispatchedByRider: { select: { name: true, mobile: true } },
      companyLocation: { select: { name: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (trigger === "package_ready") {
    if (!order.packageReadyAt) {
      return NextResponse.json(
        { error: "Package ready SMS requires the order to be marked ready first" },
        { status: 400 },
      );
    }
  } else if (trigger === "dispatched") {
    if (!DISPATCHED_OR_LATER.has(order.fulfillmentStage)) {
      return NextResponse.json(
        { error: "Dispatched SMS is only available after the order has been dispatched" },
        { status: 400 },
      );
    }
  } else if (trigger === "delivery_complete") {
    if (!order.deliveryCompleteAt) {
      return NextResponse.json(
        { error: "Delivery complete SMS requires a completed delivery" },
        { status: 400 },
      );
    }
  } else if (trigger === "rider_dispatched") {
    if (order.fulfillmentStage !== "dispatched") {
      return NextResponse.json(
        { error: "Rider SMS re-send is only available for dispatched orders" },
        { status: 400 },
      );
    }
    if (!order.dispatchedByRiderId || !order.dispatchedByRider) {
      return NextResponse.json(
        { error: "Rider SMS re-send requires a rider assignment" },
        { status: 400 },
      );
    }
    if (!order.dispatchedByRider.mobile?.trim()) {
      return NextResponse.json(
        { error: "Rider has no phone number configured" },
        { status: 400 },
      );
    }
    const invoiceNumber = resolveOrderInvoiceNumber(order);
    if (!invoiceNumber) {
      return NextResponse.json(
        {
          error:
            "Cannot send rider SMS without an ERP invoice number. Sync the order to ERPNext first.",
        },
        { status: 400 },
      );
    }
  }

  const customerPhone = resolveCustomerPhone(order);
  if (trigger !== "rider_dispatched" && !customerPhone) {
    return NextResponse.json(
      { error: "Order has no customer phone number for SMS" },
      { status: 400 },
    );
  }

  const orderNum = resolveOrderNumber(order);
  const invoiceNumber = resolveOrderInvoiceNumber(order);
  const deliveryUrl = order.riderDeliveryToken ? getDeliveryUrl(order) : undefined;
  const rider = order.dispatchedByRider;

  try {
    await sendOrderSms(companyId, order.id, trigger, {
      orderNumber: orderNum,
      invoiceNumber,
      customerPhone,
      locationName: order.companyLocation?.name,
      deliveryUrl,
      riderName: rider?.name ?? undefined,
      riderPhone: rider?.mobile ?? undefined,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[Resend SMS] ${trigger} failed:`, err);
    return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 });
  }
}
