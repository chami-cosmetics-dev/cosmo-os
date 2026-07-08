import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { getDeliveryUrl, resolveCustomerPhone, resolveOrderInvoiceNumber, resolveOrderNumber, sendOrderSms } from "@/lib/order-sms";
import { DISPATCHABLE_STAGES, printFieldsOnDispatchIfUnprinted } from "@/lib/fulfillment-permissions";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import { getErpOutOfStockFulfillmentBlock } from "@/lib/erp-fulfillment-block";
import { isExplicitlyPackageReady } from "@/lib/fulfillment-stage-display";
import {
  createOrGetOrderPaymentApproval,
  getFinancePaymentApprovalBlockReason,
  isOrderPaymentRequiresApproval,
} from "@/lib/approval-workflow";

const schema = z.object({
  orderIds: z.array(cuidSchema).min(1).max(50),
  riderId: cuidSchema.optional(),
  courierServiceId: cuidSchema.optional(),
  dispatchToCustomer: z.boolean().optional(),
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

  const { orderIds, riderId, courierServiceId, dispatchToCustomer: dispatchToCustomerRaw } = parsed.data;
  const dispatchToCustomer = dispatchToCustomerRaw === true;

  if (riderId && courierServiceId) return NextResponse.json({ error: "Select either rider, courier, or customer pickup" }, { status: 400 });
  const dispatchModes = [Boolean(riderId), Boolean(courierServiceId), dispatchToCustomer].filter(Boolean).length;
  if (dispatchModes !== 1) {
    return NextResponse.json({ error: "Select rider, courier service, or customer pickup" }, { status: 400 });
  }

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
          printCount: true,
          lastPrintedAt: true,
          packageReadyAt: true,
          packageOnHoldAt: true,
          customerPhone: true,
          shippingAddress: true,
          erpnextInvoiceId: true,
          erpnextSyncError: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
          totalPrice: true,
          companyLocationId: true,
          companyLocation: { select: { name: true } },
        },
      });

      const ref = order?.name ?? order?.orderNumber ?? orderId;

      if (!order) {
        results.push({ orderId, ref, success: false, error: "Order not found" });
        continue;
      }

      const DISPATCHABLE = DISPATCHABLE_STAGES as readonly string[];
      if (!DISPATCHABLE.includes(order.fulfillmentStage)) {
        results.push({ orderId, ref, success: false, error: "Order is not in a dispatchable stage" });
        continue;
      }

      if (order.packageOnHoldAt) {
        results.push({ orderId, ref, success: false, error: "Package is on hold" });
        continue;
      }

      const erpOutOfStockBlock = getErpOutOfStockFulfillmentBlock(order.erpnextSyncError);
      if (erpOutOfStockBlock) {
        results.push({ orderId, ref, success: false, error: erpOutOfStockBlock });
        continue;
      }

      const financeBlock = await getFinancePaymentApprovalBlockReason({
        id: order.id,
        paymentGatewayPrimary: order.paymentGatewayPrimary,
        paymentGatewayNames: order.paymentGatewayNames ?? [],
        erpnextInvoiceId: order.erpnextInvoiceId,
      });
      if (financeBlock) {
        // If the block is due to a missing approval record (ERP webhook silent failure),
        // create it now so finance can see and act on it.
        if (isOrderPaymentRequiresApproval(order)) {
          void createOrGetOrderPaymentApproval({
            companyId,
            orderId: order.id,
            requestedById: auth.context!.user!.id,
            invoiceLabel: order.name ?? order.orderNumber ?? order.shopifyOrderId,
            paymentType: order.paymentGatewayPrimary ?? "bank transfer",
            amount: order.totalPrice.toString(),
            companyLocationId: order.companyLocationId,
          }).catch((err) => console.error("[dispatch] approval self-heal failed:", err));
        }
        results.push({ orderId, ref, success: false, error: financeBlock });
        continue;
      }

      const riderDeliveryToken = riderId ? randomBytes(16).toString("hex") : null;

      // Auto-mark ready if not already — same as single dispatch
      const needsMarkReady =
        order.fulfillmentStage !== "ready_to_dispatch" ||
        !isExplicitlyPackageReady({
          packageReadyAt: order.packageReadyAt,
          lastPrintedAt: order.lastPrintedAt,
        });

      await prisma.order.update({
        where: { id: orderId },
        data: {
          ...printFieldsOnDispatchIfUnprinted(order, auth.context!.user!.id, now),
          ...(needsMarkReady && {
            packageReadyAt: now,
            packageReadyById: auth.context!.user!.id,
            packageOnHoldAt: null,
            packageHoldReasonId: null,
          }),
          ...orderStageUpdate("dispatched", now),
          dispatchedAt: now,
          dispatchedById: auth.context!.user!.id,
          dispatchedByRiderId: dispatchToCustomer ? null : (riderId ?? null),
          dispatchedByCourierServiceId: dispatchToCustomer ? null : (courierServiceId ?? null),
          dispatchedToCustomer: dispatchToCustomer,
          deliveryOutcome: "pending",
          deliveryFailedReason: null,
          lastRiderUpdateAt: riderId ? now : null,
          riderDeliveryToken: dispatchToCustomer ? null : riderDeliveryToken,
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

      const orderNum = resolveOrderNumber(order);
      const invoiceNumber = resolveOrderInvoiceNumber(order);
      const locationName = order.companyLocation?.name ?? "";
      const customerPhone = resolveCustomerPhone(order);

      if (needsMarkReady) {
        sendOrderSms(companyId, orderId, "package_ready", {
          orderNumber: orderNum,
          invoiceNumber,
          customerPhone,
          locationName,
        }).catch((err) => console.error("[bulk-dispatch] package_ready SMS failed:", err));
      }

      const deliveryUrl = riderDeliveryToken ? getDeliveryUrl({ riderDeliveryToken }) : undefined;
      sendOrderSms(companyId, orderId, "dispatched", {
        orderNumber: orderNum,
        invoiceNumber,
        customerPhone,
        locationName,
        deliveryUrl,
      }).catch((err) => console.error("[bulk-dispatch] dispatched SMS failed:", err));

      if (riderId && riderDeliveryToken) {
        sendOrderSms(companyId, orderId, "rider_dispatched", {
          orderNumber: orderNum,
          invoiceNumber,
          orderReference: [orderNum, invoiceNumber].filter(Boolean).join(" / "),
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
        metadata: {
          action: "dispatch",
          riderId: riderId ?? null,
          courierServiceId: courierServiceId ?? null,
          dispatchToCustomer,
          bulk: true,
        },
      });

      results.push({ orderId, ref, success: true });
    } catch (err) {
      console.error("[bulk-dispatch] error for orderId", orderId, err);
      results.push({ orderId, ref: orderId, success: false, error: "Internal error" });
    }
  }

  return NextResponse.json({ results });
}
