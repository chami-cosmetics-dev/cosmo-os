import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { getDeliveryUrl, resolveCustomerPhone, resolveOrderInvoiceNumber, resolveOrderNumber, sendOrderSms } from "@/lib/order-sms";
import { DISPATCHABLE_STAGES, printFieldsOnDispatchIfUnprinted } from "@/lib/fulfillment-permissions";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { citypakBulkShipmentOverrideSchema, citypakManualShipmentSchema, cuidSchema } from "@/lib/validation";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import { getErpOutOfStockFulfillmentBlock } from "@/lib/erp-fulfillment-block";
import { isExplicitlyPackageReady } from "@/lib/fulfillment-stage-display";
import { CITYPAK_BULK_CREATE_GAP_MS } from "@/lib/citypak-api";
import {
  citypakOverrideOrderPatch,
  createCitypakManualShipment,
  ensureCitypakShipmentForDispatch,
} from "@/lib/citypak-dispatch";
import {
  createCitypakApiDispatchBatch,
  finalizeCitypakApiDispatchBatch,
} from "@/lib/order-waybills";
import { isCitypakCourier } from "@/lib/courier";
import {
  createOrGetOrderPaymentApproval,
  getFinancePaymentApprovalBlockReason,
  isOrderPaymentRequiresApproval,
} from "@/lib/approval-workflow";

const schema = z.object({
  orderIds: z.array(cuidSchema).max(50).default([]),
  riderId: cuidSchema.optional(),
  courierServiceId: cuidSchema.optional(),
  dispatchToCustomer: z.boolean().optional(),
  citypakShipments: z.array(citypakBulkShipmentOverrideSchema).max(50).optional(),
  citypakManualShipments: z.array(citypakManualShipmentSchema).max(20).optional(),
});

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

  const { orderIds, riderId, courierServiceId, dispatchToCustomer: dispatchToCustomerRaw, citypakShipments, citypakManualShipments } = parsed.data;
  const dispatchToCustomer = dispatchToCustomerRaw === true;
  const manuals = citypakManualShipments ?? [];
  const citypakByOrderId = new Map(
    (citypakShipments ?? []).map((shipment) => [shipment.orderId, shipment])
  );

  if (orderIds.length === 0 && manuals.length === 0) {
    return NextResponse.json({ error: "Select orders or add a manual CityPak row" }, { status: 400 });
  }

  if (riderId && courierServiceId) return NextResponse.json({ error: "Select either rider, courier, or customer pickup" }, { status: 400 });
  const dispatchModes = [Boolean(riderId), Boolean(courierServiceId), dispatchToCustomer].filter(Boolean).length;
  if (orderIds.length > 0 && dispatchModes !== 1) {
    return NextResponse.json({ error: "Select rider, courier service, or customer pickup" }, { status: 400 });
  }
  if (orderIds.length === 0 && !courierServiceId) {
    return NextResponse.json({ error: "Select City Pack to send manual CityPak rows" }, { status: 400 });
  }

  // Validate rider / courier once up front
  let riderMobile: string | null = null;
  let courierServiceName: string | null = null;
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
    courierServiceName = svc.name;
  }

  const now = new Date();
  const results: Array<{
    orderId: string;
    waybillId?: string | null;
    ref: string;
    success: boolean;
    error?: string;
    citypakStatus?: "skipped" | "booked" | "falcon";
    citypakError?: string;
    citypakTracking?: string | null;
    manual?: boolean;
  }> = [];
  const smsTasks: Promise<void>[] = [];
  let citypakCreates = 0;
  const plannedCitypak =
    isCitypakCourier(courierServiceName) ? orderIds.length + manuals.length : 0;
  const citypakBatchId =
    plannedCitypak > 0
      ? await createCitypakApiDispatchBatch({
          companyId,
          uploadedById: auth.context!.user!.id,
          plannedTotal: plannedCitypak,
        })
      : null;
  let citypakBooked = 0;
  let citypakFalcon = 0;

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
          billingAddress: true,
          rawPayload: true,
          sourceName: true,
          financialStatus: true,
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

      const erpOutOfStockBlock = getErpOutOfStockFulfillmentBlock(
        order.erpnextSyncError,
        order.erpnextInvoiceId,
      );
      if (erpOutOfStockBlock) {
        results.push({ orderId, ref, success: false, error: erpOutOfStockBlock });
        continue;
      }

      const pendingCancelApproval = await prisma.approvalRequest.findFirst({
        where: { orderId: order.id, type: "order_cancel_approval", status: "pending" },
        select: { id: true },
      });
      if (pendingCancelApproval) {
        results.push({ orderId, ref, success: false, error: "Order has a pending cancel request — awaiting finance approval" });
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
      const citypakShipment = citypakByOrderId.get(orderId);
      const citypakAddressPatch = citypakShipment
        ? citypakOverrideOrderPatch({
            shippingAddress: order.shippingAddress,
            override: citypakShipment,
          })
        : null;
      if (citypakAddressPatch) {
        order.shippingAddress = citypakAddressPatch.shippingAddress as typeof order.shippingAddress;
        order.customerPhone = citypakAddressPatch.customerPhone;
      }

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
          ...(citypakAddressPatch
            ? {
                shippingAddress: citypakAddressPatch.shippingAddress as Prisma.InputJsonValue,
                customerPhone: citypakAddressPatch.customerPhone,
              }
            : {}),
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

      const deliveryUrl = riderDeliveryToken ? getDeliveryUrl({ riderDeliveryToken }) : undefined;

      if (needsMarkReady) {
        smsTasks.push(
          sendOrderSms(companyId, orderId, "package_ready", {
            orderNumber: orderNum,
            invoiceNumber,
            customerPhone,
            locationName,
          }).catch((err) => console.error("[bulk-dispatch] package_ready SMS failed:", err))
        );
      }

      smsTasks.push(
        sendOrderSms(companyId, orderId, "dispatched", {
          orderNumber: orderNum,
          invoiceNumber,
          customerPhone,
          locationName,
          deliveryUrl,
        }).catch((err) => console.error("[bulk-dispatch] dispatched SMS failed:", err))
      );

      if (riderId && riderDeliveryToken) {
        smsTasks.push(
          sendOrderSms(companyId, orderId, "rider_dispatched", {
            orderNumber: orderNum,
            invoiceNumber,
            orderReference: [orderNum, invoiceNumber].filter(Boolean).join(" / "),
            deliveryUrl,
            riderPhone: riderMobile ?? undefined,
          }).catch((err) => console.error("[bulk-dispatch] rider SMS failed:", err))
        );
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

      let citypakStatus: "skipped" | "booked" | "falcon" | undefined;
      let citypakError: string | undefined;
      let citypakTracking: string | null | undefined;
      let citypakWaybillId: string | null | undefined;
      if (courierServiceId) {
        if (isCitypakCourier(courierServiceName) && citypakCreates > 0) {
          await new Promise((resolve) => setTimeout(resolve, CITYPAK_BULK_CREATE_GAP_MS));
        }
        const citypak = await ensureCitypakShipmentForDispatch({
          companyId,
          courierServiceName,
          order,
          shipmentOverride: citypakShipment,
          uploadId: citypakBatchId,
        });
        if (isCitypakCourier(courierServiceName) && citypak.status !== "skipped") {
          citypakCreates += 1;
        }
        citypakStatus = citypak.status;
        if (citypak.status === "booked") {
          citypakTracking = citypak.trackingNumber;
          citypakWaybillId = citypak.waybillId ?? null;
          citypakBooked += 1;
        }
        if (citypak.status === "falcon") {
          citypakError = citypak.error;
          citypakFalcon += 1;
        }
      }

      results.push({
        orderId,
        waybillId: citypakWaybillId,
        ref,
        success: true,
        citypakStatus,
        citypakError,
        citypakTracking,
      });
    } catch (err) {
      console.error("[bulk-dispatch] error for orderId", orderId, err);
      results.push({ orderId, ref: orderId, success: false, error: "Internal error" });
    }
  }

  for (const manual of manuals) {
    try {
      if (!isCitypakCourier(courierServiceName)) {
        results.push({
          orderId: "",
          ref: manual.reference,
          success: false,
          error: "Select City Pack to send manual rows",
          manual: true,
        });
        continue;
      }
      if (citypakCreates > 0) {
        await new Promise((resolve) => setTimeout(resolve, CITYPAK_BULK_CREATE_GAP_MS));
      }
      const citypak = await createCitypakManualShipment({
        companyId,
        courierServiceName,
        accountDbId: manual.citypakAccountDbId,
        reference: manual.reference,
        shipment: manual,
        uploadId: citypakBatchId,
      });
      citypakCreates += 1;
      if (citypak.status === "booked") citypakBooked += 1;
      if (citypak.status === "falcon") citypakFalcon += 1;
      results.push({
        orderId: "",
        waybillId: citypak.status === "booked" ? citypak.waybillId ?? null : null,
        ref: manual.reference,
        success: citypak.status === "booked",
        citypakStatus: citypak.status,
        citypakError: citypak.status === "falcon" ? citypak.error : undefined,
        citypakTracking: citypak.status === "booked" ? citypak.trackingNumber : null,
        error: citypak.status === "falcon" ? citypak.error : undefined,
        manual: true,
      });
    } catch (err) {
      console.error("[bulk-dispatch] manual CityPak error", err);
      results.push({
        orderId: "",
        ref: manual.reference,
        success: false,
        error: "Internal error",
        manual: true,
      });
    }
  }

  await Promise.allSettled(smsTasks);

  if (citypakBatchId) {
    const dispatcher = auth.context!.user!;
    await finalizeCitypakApiDispatchBatch({
      companyId,
      uploadId: citypakBatchId,
      booked: citypakBooked,
      falconFallback: citypakFalcon,
      plannedTotal: plannedCitypak,
      dispatchedByName: dispatcher.name ?? dispatcher.email ?? null,
    });
  }

  return NextResponse.json({ results });
}
