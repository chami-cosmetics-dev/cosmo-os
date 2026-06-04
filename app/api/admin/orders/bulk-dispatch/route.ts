import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { sendOrderSms, getDeliveryUrl } from "@/lib/order-sms";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const schema = z.object({
  orderIds: z.array(cuidSchema).min(1).max(50),
  riderId: cuidSchema.optional(),
  courierServiceId: cuidSchema.optional(),
});

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getCompanyId(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
  return user?.companyId ?? null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.ready_dispatch.dispatch"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });

  const { orderIds, riderId, courierServiceId } = parsed.data;

  if (riderId && courierServiceId) return NextResponse.json({ error: "Select either rider or courier, not both" }, { status: 400 });
  if (!riderId && !courierServiceId) return NextResponse.json({ error: "Select either rider or courier" }, { status: 400 });

  // Validate rider / courier once up front
  let riderMobile: string | null = null;
  if (riderId) {
    const rider = await prisma.user.findFirst({
      where: { id: riderId, companyId },
      select: { mobile: true, employeeProfile: { select: { isRider: true } } },
    });
    if (!rider?.employeeProfile?.isRider) {
      return NextResponse.json({ error: "Selected user is not a rider" }, { status: 400 });
    }
    riderMobile = rider.mobile ?? null;
  }
  if (courierServiceId) {
    const svc = await prisma.courierService.findFirst({ where: { id: courierServiceId, companyId } });
    if (!svc) return NextResponse.json({ error: "Courier service not found" }, { status: 400 });
  }

  const now = new Date();
  const results: Array<{ orderId: string; ref: string; success: boolean; error?: string }> = [];

  for (const orderId of orderIds) {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, companyId },
        select: {
          id: true,
          name: true,
          orderNumber: true,
          shopifyOrderId: true,
          fulfillmentStage: true,
          packageReadyAt: true,
          customerPhone: true,
          companyLocation: { select: { name: true } },
        },
      });

      const ref = order?.name ?? order?.orderNumber ?? orderId;

      if (!order) {
        results.push({ orderId, ref, success: false, error: "Order not found" });
        continue;
      }

      const DISPATCHABLE_STAGES = ["order_received", "sample_free_issue", "ready_to_dispatch"];
      if (!DISPATCHABLE_STAGES.includes(order.fulfillmentStage)) {
        results.push({ orderId, ref, success: false, error: "Order is not in a dispatchable stage" });
        continue;
      }

      const riderDeliveryToken = riderId ? randomBytes(16).toString("hex") : null;

      // Auto-mark ready if not already — mirrors single dispatch behaviour
      const needsMarkReady = order.fulfillmentStage !== "ready_to_dispatch" || !order.packageReadyAt;

      await prisma.order.update({
        where: { id: orderId },
        data: {
          ...(needsMarkReady && {
            packageReadyAt: now,
            packageReadyById: auth.context!.user!.id,
            packageOnHoldAt: null,
            packageHoldReasonId: null,
          }),
          fulfillmentStage: "dispatched",
          dispatchedAt: now,
          dispatchedById: auth.context!.user!.id,
          dispatchedByRiderId: riderId ?? null,
          dispatchedByCourierServiceId: courierServiceId ?? null,
          deliveryOutcome: "pending",
          deliveryFailedReason: null,
          lastRiderUpdateAt: riderId ? now : null,
          riderDeliveryToken,
        },
      });

      if (riderId) {
        await prisma.riderDeliveryTask.upsert({
          where: { orderId },
          create: {
            orderId,
            riderId,
            status: "assigned",
            deliveryKind: "normal",
            exchangeId: null,
            oldOrderLabel: null,
            replacementOrderLabel: null,
            requiresOldItemCollection: false,
            oldItemCollectionStatus: "pending",
            oldItemCollectionRemark: null,
            exchangePaymentDifference: null,
            assignedAt: now,
            latestSyncAt: now,
          },
          update: {
            riderId,
            status: "assigned",
            deliveryKind: "normal",
            exchangeId: null,
            oldOrderLabel: null,
            replacementOrderLabel: null,
            requiresOldItemCollection: false,
            oldItemCollectionStatus: "pending",
            oldItemCollectionRemark: null,
            exchangePaymentDifference: null,
            assignedAt: now,
            acceptedAt: null,
            arrivedAt: null,
            completedAt: null,
            failedAt: null,
            failureReason: null,
            latestSyncAt: now,
          },
        });
      } else {
        await prisma.riderDeliveryTask.deleteMany({ where: { orderId } });
      }

      const orderNum = order.orderNumber ?? order.name ?? order.shopifyOrderId;
      sendOrderSms(companyId, orderId, "dispatched", {
        orderNumber: orderNum,
        customerPhone: order.customerPhone ?? undefined,
        locationName: order.companyLocation?.name ?? "",
      }).catch((err) => console.error("[bulk-dispatch] SMS failed:", err));

      if (riderId && riderDeliveryToken) {
        const deliveryUrl = getDeliveryUrl({ riderDeliveryToken });
        sendOrderSms(companyId, orderId, "rider_dispatched", {
          orderNumber: orderNum,
          deliveryUrl,
          riderPhone: riderMobile ?? undefined,
        }).catch((err) => console.error("[bulk-dispatch] rider SMS failed:", err));
      }

      await writeAuditLog({
        companyId,
        actorUserId: auth.context!.user!.id,
        module: "orders",
        action: "fulfillment_updated",
        entityType: "Order",
        entityId: orderId,
        summary: `Bulk dispatched order ${orderNum}`,
        beforeData: { fulfillmentStage: order.fulfillmentStage },
        afterData: { fulfillmentStage: "dispatched" },
        metadata: { action: "dispatch", riderId: riderId ?? null, courierServiceId: courierServiceId ?? null, bulk: true },
      });

      results.push({ orderId, ref, success: true });
    } catch (err) {
      console.error("[bulk-dispatch] error for orderId", orderId, err);
      results.push({ orderId, ref: orderId, success: false, error: "Internal error" });
    }
  }

  return NextResponse.json({ results });
}
