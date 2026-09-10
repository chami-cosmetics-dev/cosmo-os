import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { createCitypakApiDispatchBatch, finalizeCitypakApiDispatchBatch } from "@/lib/order-waybills";
import {
  ensureCitypakShipmentForDispatch,
  releaseCitypakApiToFalcon,
} from "@/lib/citypak-dispatch";
import { isCitypakCourier } from "@/lib/courier";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  action: z.enum(["retry", "release_to_falcon"]),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * After CityPak API fails on dispatch, the order is held (not Falcon).
 * - retry: try CityPak create again (up to 3 attempts)
 * - release_to_falcon: drop the hold so Falcon Upload lists it
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAnyPermission([
    "fulfillment.ready_dispatch.dispatch",
    "fulfillment.falcon_upload.export",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id } = await context.params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "action must be retry or release_to_falcon" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idParsed.data, companyId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      erpnextInvoiceId: true,
      sourceName: true,
      financialStatus: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      totalPrice: true,
      customerPhone: true,
      shippingAddress: true,
      billingAddress: true,
      rawPayload: true,
      companyLocationId: true,
      fulfillmentStage: true,
      dispatchedByCourierService: { select: { name: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (parsed.data.action === "release_to_falcon") {
    const released = await releaseCitypakApiToFalcon({ companyId, orderId: order.id });
    if (!released.ok) {
      return NextResponse.json({ error: released.error }, { status: 400 });
    }
    await writeAuditLog({
      companyId,
      actorUserId: auth.context!.user!.id,
      module: "orders",
      action: "fulfillment_updated",
      entityType: "Order",
      entityId: order.id,
      summary: `Released order ${order.name ?? order.orderNumber ?? order.id} to Falcon Upload after CityPak API hold`,
    });
    return NextResponse.json({
      success: true,
      citypakStatus: "falcon",
      message: "Released to Falcon Upload.",
    });
  }

  const courierServiceName = order.dispatchedByCourierService?.name ?? null;
  if (!isCitypakCourier(courierServiceName)) {
    return NextResponse.json(
      { error: "Order is not on City Pack — nothing to retry." },
      { status: 400 }
    );
  }

  const batchId = await createCitypakApiDispatchBatch({
    companyId,
    uploadedById: auth.context!.user!.id,
    plannedTotal: 1,
  });

  const citypak = await ensureCitypakShipmentForDispatch({
    companyId,
    courierServiceName,
    order,
    uploadId: batchId,
  });

  const dispatcher = auth.context!.user!;
  await finalizeCitypakApiDispatchBatch({
    companyId,
    uploadId: batchId,
    booked: citypak.status === "booked" ? 1 : 0,
    falconFallback: citypak.status === "booked" ? 0 : 1,
    plannedTotal: 1,
    dispatchedByName: dispatcher.name ?? dispatcher.email ?? null,
  });

  await writeAuditLog({
    companyId,
    actorUserId: dispatcher.id,
    module: "orders",
    action: "fulfillment_updated",
    entityType: "Order",
    entityId: order.id,
    summary:
      citypak.status === "booked"
        ? `Retried CityPak API book for ${order.name ?? order.orderNumber ?? order.id} → ${citypak.trackingNumber}`
        : `CityPak API retry still failed for ${order.name ?? order.orderNumber ?? order.id}`,
    metadata: { citypakStatus: citypak.status },
  });

  if (citypak.status === "booked") {
    return NextResponse.json({
      success: true,
      citypakStatus: "booked",
      citypakTracking: citypak.trackingNumber,
      citypakWaybillId: citypak.waybillId ?? null,
      message: `Booked as ${citypak.trackingNumber}`,
    });
  }

  if (citypak.status === "retry") {
    return NextResponse.json({
      success: false,
      citypakStatus: "retry",
      citypakError: citypak.error,
      citypakAttempts: citypak.attempts,
      message: `Still held for retry. ${citypak.error}`,
    });
  }

  return NextResponse.json({
    success: false,
    citypakStatus: citypak.status,
    citypakError: "error" in citypak ? citypak.error : "CityPak booking failed",
    message: "error" in citypak ? citypak.error : "CityPak booking failed",
  });
}
