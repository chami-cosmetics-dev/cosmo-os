import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { hasPermission, requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { getDeliveryUrl, resolveCustomerPhone, resolveOrderInvoiceNumber, resolveOrderNumber, sendOrderSms } from "@/lib/order-sms";
import { DISPATCHABLE_STAGES, printFieldsOnDispatchIfUnprinted } from "@/lib/fulfillment-permissions";
import {
  buildReturnRemarkText,
  RETURN_REMARK_TEMPLATE_CODES,
} from "@/lib/return-remark-templates";
import type { FulfillmentStage } from "@prisma/client";
import {
  calculateExchangePaymentDifference,
  orderDisplayLabel,
  requiresOldItemCollection,
} from "@/lib/rider-delivery-special";
import { createErpnextCreditNote, cancelErpnextSalesInvoice } from "@/lib/erpnext-sync";
import {
  cancelShopifyOrder,
  isRealShopifyOrderId,
  shouldBlockShopifyCancelInOs,
  VAULT_SHOPIFY_CANCEL_BLOCKED_MESSAGE,
} from "@/lib/shopify-admin";
import { markOrderDelivered } from "@/lib/mark-order-delivered";
import { markOrderInvoiceComplete } from "@/lib/mark-order-invoice-complete";
import {
  isAllowedCompanyErpPaymentMode,
  listCompanyErpPaymentModes,
} from "@/lib/erp-payment-modes";
import {
  createOrGetOrderCancelApproval,
  createOrGetOrderPaymentApproval,
  getFinancePaymentApprovalBlockReason,
  isOrderPaymentRequiresApproval,
} from "@/lib/approval-workflow";
import { orderStageUpdate, orderStageUpdateIfChanged } from "@/lib/order-stage-timing";
import { getErpOutOfStockFulfillmentBlock } from "@/lib/erp-fulfillment-block";
import { isExplicitlyPackageReady } from "@/lib/fulfillment-stage-display";

const addSampleSchema = z.object({
  sampleFreeIssueItemId: cuidSchema,
  quantity: z.number().int().min(1).max(99),
});

const fulfillmentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_samples"),
    samples: z.array(addSampleSchema).min(1).max(20),
  }),
  z.object({
    action: z.literal("advance_to_print"),
  }),
  z.object({
    action: z.literal("set_sample_send_later_date"),
    sendLaterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({
    action: z.literal("send_sample_now"),
  }),
  z.object({
    action: z.literal("cancel_sample_send_later"),
  }),
  z.object({
    action: z.literal("put_on_hold"),
    holdReasonId: cuidSchema,
  }),
  z.object({
    action: z.literal("mark_ready"),
  }),
  z.object({
    action: z.literal("revert_hold"),
  }),
  z.object({
    action: z.literal("dispatch"),
    riderId: cuidSchema.optional(),
    courierServiceId: cuidSchema.optional(),
    dispatchToCustomer: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("mark_invoice_complete"),
    modeOfPayment: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("mark_delivered"),
  }),
  z.object({
    action: z.literal("complete_pos"),
  }),
  z.object({
    action: z.literal("cancel_order"),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    action: z.literal("revert_to_stage"),
    targetStage: z.enum([
      "order_received",
      "sample_free_issue",
      "print",
      "ready_to_dispatch",
      "dispatched",
      "delivery_complete",
    ]),
    revertReason: z.string().trim().min(1).max(500),
    remarkTemplate: z.enum(RETURN_REMARK_TEMPLATE_CODES).optional(),
  }),
]);

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

function getRequiredPermissionsForAction(action: string): string[] {
  switch (action) {
    case "add_samples":
    case "advance_to_print":
    case "set_sample_send_later_date":
    case "send_sample_now":
    case "cancel_sample_send_later":
      return ["fulfillment.sample_free_issue.manage"];
    case "put_on_hold":
      return ["fulfillment.ready_dispatch.put_on_hold"];
    case "mark_ready":
      return ["fulfillment.ready_dispatch.package_ready"];
    case "revert_hold":
      return ["fulfillment.ready_dispatch.revert_hold"];
    case "dispatch":
      return ["fulfillment.ready_dispatch.dispatch"];
    case "mark_delivered":
      return ["fulfillment.delivery_invoice.mark_delivered"];
    case "mark_invoice_complete":
      return ["fulfillment.delivery_invoice.mark_complete"];
    case "cancel_order":
      return ["orders.cancel"];
    case "complete_pos":
      return ["orders.manage"];
    case "revert_to_stage":
      return [
        "fulfillment.revert_to.order_received",
        "fulfillment.revert_to.sample_free_issue",
        "fulfillment.revert_to.print",
        "fulfillment.revert_to.ready_dispatch",
        "fulfillment.revert_to.dispatched",
        "fulfillment.revert_to.delivery_complete",
      ];
    default:
      return ["orders.manage"];
  }
}

const FULFILLMENT_STAGE_ORDER: FulfillmentStage[] = [
  "order_received",
  "sample_free_issue",
  "print",
  "returned_to_store",
  "ready_to_dispatch",
  "dispatched",
  "delivery_complete",
  "invoice_complete",
];

function stageToPermissionKey(stage: FulfillmentStage): string {
  return stage === "ready_to_dispatch" ? "ready_dispatch" : stage;
}

function getRequiredRevertPermissions(
  targetStage: FulfillmentStage,
  currentStage: FulfillmentStage
): string[] {
  const targetIdx = FULFILLMENT_STAGE_ORDER.indexOf(targetStage);
  const currentIdx = FULFILLMENT_STAGE_ORDER.indexOf(currentStage);
  if (targetIdx >= currentIdx) return [];
  const perms: string[] = [];
  for (let i = targetIdx; i < currentIdx; i++) {
    perms.push(`fulfillment.revert_to.${stageToPermissionKey(FULFILLMENT_STAGE_ORDER[i])}`);
  }
  return perms;
}

function dateOnlyUtc(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function dateInputValueUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isBankTransferGateway(order: {
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
}) {
  return [order.paymentGatewayPrimary, ...order.paymentGatewayNames]
    .map(normalizeText)
    .some((value) => value.includes("bank"));
}

function getShippingServiceForReturn(order: {
  dispatchedByRiderId: string | null;
  dispatchedByRider: { name: string | null; mobile: string | null } | null;
  dispatchedByCourierService: { name: string } | null;
}) {
  if (order.dispatchedByRiderId) {
    return {
      type: "rider",
      name: order.dispatchedByRider?.name ?? order.dispatchedByRider?.mobile ?? "Rider",
    };
  }
  return {
    type: "courier",
    name: order.dispatchedByCourierService?.name ?? "Courier",
  };
}

async function hasPendingBankTransferRearrange(order: {
  id: string;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
}) {
  if (!isBankTransferGateway(order)) return false;
  return Boolean(
    await prisma.orderReturn.findFirst({
      where: {
        orderId: order.id,
        actionType: "rearrange",
        actionStatus: "pending",
      },
      select: { id: true },
    })
  );
}


async function logOrderFulfillmentAudit(input: {
  companyId: string;
  actorUserId: string;
  orderId: string;
  summary: string;
  beforeStage: FulfillmentStage;
  afterStage: FulfillmentStage;
  metadata?: Record<string, unknown>;
}) {
  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    module: "orders",
    action: "fulfillment_updated",
    entityType: "Order",
    entityId: input.orderId,
    summary: input.summary,
    beforeData: { fulfillmentStage: input.beforeStage },
    afterData: { fulfillmentStage: input.afterStage },
    metadata: input.metadata,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await request.json().catch(() => ({}));
  const parsed = fulfillmentActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const requiredPermissions = getRequiredPermissionsForAction(parsed.data.action);
  const auth = await requireAnyPermission(requiredPermissions);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
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
      dispatchedByCourierService: true,
      dispatchedByRider: true,
      packageHoldReason: true,
      sampleFreeIssues: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const erpOutOfStockBlock = getErpOutOfStockFulfillmentBlock(order.erpnextSyncError);
  // cancel_order is exempt — no ERP SI exists for out-of-stock orders, so it's OS→Shopify only
  if (erpOutOfStockBlock && parsed.data.action !== "cancel_order") {
    return NextResponse.json({ error: erpOutOfStockBlock, code: "ERP_OUT_OF_STOCK" }, { status: 409 });
  }

  const financeFulfillmentBlock = await getFinancePaymentApprovalBlockReason({
    id: order.id,
    paymentGatewayPrimary: order.paymentGatewayPrimary,
    paymentGatewayNames: order.paymentGatewayNames ?? [],
    erpnextInvoiceId: order.erpnextInvoiceId,
  });

  // If the block is due to a missing approval record (ERP webhook silent failure),
  // create it now so finance can see and act on it.
  if (financeFulfillmentBlock && isOrderPaymentRequiresApproval(order)) {
    void createOrGetOrderPaymentApproval({
      companyId,
      orderId: order.id,
      requestedById: auth.context!.user!.id,
      invoiceLabel: order.name ?? order.orderNumber ?? order.shopifyOrderId,
      paymentType: order.paymentGatewayPrimary ?? "bank transfer",
      amount: order.totalPrice.toString(),
      companyLocationId: order.companyLocationId,
    }).catch((err) => console.error("[fulfillment] approval self-heal failed:", err));
  }

  const data = parsed.data;
  const now = new Date();

  try {
    if (data.action === "add_samples") {
      if (order.fulfillmentStage !== "sample_free_issue" && order.fulfillmentStage !== "order_received") {
        return NextResponse.json(
          { error: "Samples can only be added at sample/free issue stage" },
          { status: 400 }
        );
      }

      const sampleIds = Array.from(
        new Set(data.samples.map((sample) => sample.sampleFreeIssueItemId))
      );
      const validItems = await prisma.sampleFreeIssueItem.findMany({
        where: { companyId, id: { in: sampleIds } },
        select: { id: true },
      });
      const validItemIds = new Set(validItems.map((item) => item.id));
      const missingSample = sampleIds.find((sampleId) => !validItemIds.has(sampleId));
      if (missingSample) {
        return NextResponse.json(
          { error: `Sample/free issue item not found: ${missingSample}` },
          { status: 400 }
        );
      }

      await prisma.$transaction(
        data.samples.map((sample) =>
          prisma.orderSampleFreeIssue.upsert({
            where: {
              orderId_sampleFreeIssueItemId: {
                orderId: order.id,
                sampleFreeIssueItemId: sample.sampleFreeIssueItemId,
              },
            },
            create: {
              orderId: order.id,
              sampleFreeIssueItemId: sample.sampleFreeIssueItemId,
              quantity: sample.quantity,
              addedById: auth.context!.user!.id,
            },
            update: { quantity: sample.quantity },
          })
        )
      );

      if (order.fulfillmentStage === "order_received") {
        await prisma.order.update({
          where: { id: order.id },
          data: orderStageUpdate("sample_free_issue", now),
        });
      }

      // Auto-submit finance approval for KOKO / bank transfer orders
      if (isOrderPaymentRequiresApproval(order)) {
        const invoiceLabel = order.name ?? order.orderNumber ?? order.shopifyOrderId ?? order.id;
        const paymentType = order.paymentGatewayPrimary ?? "payment";
        const amount = order.totalPrice.toString();
        await createOrGetOrderPaymentApproval({
          companyId,
          orderId: order.id,
          requestedById: auth.context!.user!.id,
          invoiceLabel,
          paymentType,
          amount,
          companyLocationId: order.companyLocationId,
        });
      }

      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Added samples/free issues to order ${order.orderNumber ?? order.name ?? order.id}`,
        beforeStage: order.fulfillmentStage,
        afterStage: order.fulfillmentStage === "order_received" ? "sample_free_issue" : order.fulfillmentStage,
        metadata: { action: data.action, sampleCount: data.samples.length },
      });

      return NextResponse.json({ success: true });
    }

    if (data.action === "advance_to_print") {
      if (financeFulfillmentBlock) {
        return NextResponse.json({ error: financeFulfillmentBlock }, { status: 409 });
      }
      if (order.fulfillmentStage !== "sample_free_issue" && order.fulfillmentStage !== "order_received") {
        return NextResponse.json(
          { error: "Can only advance to print from sample/free issue stage" },
          { status: 400 }
        );
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          ...orderStageUpdate("print", now),
          sampleFreeIssueCompleteAt: now,
          sampleFreeIssueCompleteById: auth.context!.user!.id,
        },
      });
      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Advanced order ${order.orderNumber ?? order.name ?? order.id} to print`,
        beforeStage: order.fulfillmentStage,
        afterStage: "print",
        metadata: { action: data.action },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "set_sample_send_later_date") {
      if (order.fulfillmentStage !== "sample_free_issue" && order.fulfillmentStage !== "order_received") {
        return NextResponse.json(
          { error: "Send later date can only be set at sample/free issue stage" },
          { status: 400 }
        );
      }

      const orderDate = dateOnlyUtc(dateInputValueUtc(order.createdAt));
      const minDate = dateInputValueUtc(orderDate);
      const maxDate = dateInputValueUtc(addDaysUtc(orderDate, 3));
      if (data.sendLaterDate < minDate || data.sendLaterDate > maxDate) {
        return NextResponse.json(
          { error: "Send later date must be within 3 days from the order date." },
          { status: 400 }
        );
      }

      const sendLaterDate = dateOnlyUtc(data.sendLaterDate);
      await prisma.order.update({
        where: { id: order.id },
        data: { sampleFreeIssueSendLaterDate: sendLaterDate },
      });
      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Set send later date for order ${order.orderNumber ?? order.name ?? order.id} to ${data.sendLaterDate}`,
        beforeStage: order.fulfillmentStage,
        afterStage: order.fulfillmentStage,
        metadata: { action: data.action, sendLaterDate: data.sendLaterDate },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "send_sample_now") {
      if (order.fulfillmentStage !== "sample_free_issue" && order.fulfillmentStage !== "order_received") {
        return NextResponse.json(
          { error: "Send now is only available at sample/free issue stage" },
          { status: 400 }
        );
      }
      if (!order.sampleFreeIssueSendLaterDate) {
        return NextResponse.json(
          { error: "This order is not scheduled for a future date." },
          { status: 400 }
        );
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { sampleFreeIssueSendLaterDate: null },
      });
      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Released scheduled order ${order.orderNumber ?? order.name ?? order.id} into today's queue`,
        beforeStage: order.fulfillmentStage,
        afterStage: order.fulfillmentStage,
        metadata: {
          action: data.action,
          previousSendLaterDate: order.sampleFreeIssueSendLaterDate.toISOString(),
        },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "cancel_sample_send_later") {
      if (order.fulfillmentStage !== "sample_free_issue" && order.fulfillmentStage !== "order_received") {
        return NextResponse.json(
          { error: "Cancel schedule is only available at sample/free issue stage" },
          { status: 400 }
        );
      }
      if (!order.sampleFreeIssueSendLaterDate) {
        return NextResponse.json(
          { error: "This order does not have a saved future schedule." },
          { status: 400 }
        );
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { sampleFreeIssueSendLaterDate: null },
      });
      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Cancelled future schedule for order ${order.orderNumber ?? order.name ?? order.id}`,
        beforeStage: order.fulfillmentStage,
        afterStage: order.fulfillmentStage,
        metadata: {
          action: data.action,
          previousSendLaterDate: order.sampleFreeIssueSendLaterDate.toISOString(),
        },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "put_on_hold") {
      if (order.fulfillmentStage !== "print" && order.fulfillmentStage !== "ready_to_dispatch") {
        return NextResponse.json(
          { error: "Can only put on hold at ready to dispatch stage" },
          { status: 400 }
        );
      }
      const reason = await prisma.packageHoldReason.findFirst({
        where: { id: data.holdReasonId, companyId },
      });
      if (!reason) {
        return NextResponse.json({ error: "Hold reason not found" }, { status: 400 });
      }
      await prisma.order.update({
        where: { id: order.id },
        data: {
          ...orderStageUpdateIfChanged(order.fulfillmentStage, "ready_to_dispatch", now),
          packageOnHoldAt: now,
          packageHoldReasonId: data.holdReasonId,
          packageReadyAt: null,
        },
      });
      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Put order ${order.orderNumber ?? order.name ?? order.id} on hold`,
        beforeStage: order.fulfillmentStage,
        afterStage: "ready_to_dispatch",
        metadata: { action: data.action, holdReasonId: data.holdReasonId },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "mark_ready") {
      if (financeFulfillmentBlock) {
        return NextResponse.json({ error: financeFulfillmentBlock }, { status: 409 });
      }
      if (order.fulfillmentStage !== "print" && order.fulfillmentStage !== "ready_to_dispatch") {
        return NextResponse.json(
          { error: "Can only mark ready at print or ready to dispatch stage" },
          { status: 400 }
        );
      }
      if (await hasPendingBankTransferRearrange(order)) {
        return NextResponse.json(
          { error: "Bank transfer must be confirmed before rearranging this returned COD order." },
          { status: 400 }
        );
      }
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          ...orderStageUpdateIfChanged(order.fulfillmentStage, "ready_to_dispatch", now),
          packageReadyAt: now,
          packageReadyById: auth.context!.user!.id,
          packageOnHoldAt: null,
          packageHoldReasonId: null,
        },
        include: { companyLocation: true },
      });
      sendOrderSms(companyId, order.id, "package_ready", {
        orderNumber: resolveOrderNumber(updated),
        invoiceNumber: resolveOrderInvoiceNumber(updated),
        customerPhone: resolveCustomerPhone(updated),
        locationName: updated.companyLocation.name,
      }).catch((err) => console.error("[Order SMS] package_ready failed:", err));
      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Marked order ${updated.orderNumber ?? updated.name ?? updated.id} as package ready`,
        beforeStage: order.fulfillmentStage,
        afterStage: "ready_to_dispatch",
        metadata: { action: data.action },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "revert_hold") {
      if (order.fulfillmentStage !== "print" && order.fulfillmentStage !== "ready_to_dispatch") {
        return NextResponse.json(
          { error: "Can only revert hold at ready to dispatch stage" },
          { status: 400 }
        );
      }
      if (!order.packageOnHoldAt) {
        return NextResponse.json(
          { error: "Package is not on hold" },
          { status: 400 }
        );
      }
      await prisma.order.update({
        where: { id: order.id },
        data: {
          packageOnHoldAt: null,
          packageHoldReasonId: null,
        },
      });
      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Reverted hold on order ${order.orderNumber ?? order.name ?? order.id}`,
        beforeStage: order.fulfillmentStage,
        afterStage: order.fulfillmentStage,
        metadata: { action: data.action },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "dispatch") {
      const pendingCancelApproval = await prisma.approvalRequest.findFirst({
        where: { orderId: order.id, type: "order_cancel_approval", status: "pending" },
        select: { id: true },
      });
      if (pendingCancelApproval) {
        return NextResponse.json(
          { error: "This order has a pending cancel request — awaiting finance approval.", code: "ORDER_CANCEL_PENDING" },
          { status: 400 }
        );
      }
      if (order.financialStatus?.toLowerCase() === "voided" && order.cancelledAt) {
        let cancellerName = "a user";
        if (order.cancelledById) {
          const canceller = await prisma.user.findUnique({
            where: { id: order.cancelledById },
            select: { name: true },
          });
          cancellerName = canceller?.name ?? "a user";
        }
        return NextResponse.json(
          {
            error: `This order cannot be dispatched — it was cancelled by ${cancellerName}.${order.cancelReason ? ` Reason: ${order.cancelReason}` : ""}`,
            code: "ORDER_CANCELLED",
          },
          { status: 400 }
        );
      }
      if (financeFulfillmentBlock) {
        return NextResponse.json({ error: financeFulfillmentBlock }, { status: 409 });
      }
      const dispatchable = DISPATCHABLE_STAGES as readonly string[];
      if (!dispatchable.includes(order.fulfillmentStage)) {
        return NextResponse.json(
          { error: "Order is not in a dispatchable stage" },
          { status: 400 }
        );
      }
      if (order.packageOnHoldAt) {
        return NextResponse.json(
          { error: "Package is on hold — revert hold before dispatching" },
          { status: 400 }
        );
      }
      if (await hasPendingBankTransferRearrange(order)) {
        return NextResponse.json(
          { error: "Bank transfer must be confirmed before dispatching this rearranged COD return." },
          { status: 400 }
        );
      }
      if (data.riderId && data.courierServiceId) {
        return NextResponse.json(
          { error: "Select either rider, courier, or customer pickup — not multiple" },
          { status: 400 }
        );
      }
      const dispatchToCustomer = data.dispatchToCustomer === true;
      const dispatchModes = [Boolean(data.riderId), Boolean(data.courierServiceId), dispatchToCustomer].filter(Boolean).length;
      if (dispatchModes !== 1) {
        return NextResponse.json(
          { error: "Select rider, courier service, or customer pickup" },
          { status: 400 }
        );
      }

      let riderDeliveryToken: string | null = null;
      if (data.riderId) {
        const rider = await prisma.user.findFirst({
          where: { id: data.riderId, companyId },
          include: { employeeProfile: true },
        });
        if (!rider?.employeeProfile?.isRider) {
          return NextResponse.json(
            { error: "Selected user is not a rider" },
            { status: 400 }
          );
        }
        riderDeliveryToken = randomBytes(16).toString("hex");
      } else if (data.courierServiceId) {
        const svc = await prisma.courierService.findFirst({
          where: { id: data.courierServiceId, companyId },
        });
        if (!svc) {
          return NextResponse.json({ error: "Courier service not found" }, { status: 400 });
        }
      }

      const [rearrangedReturn, exchange] = data.riderId
        ? await Promise.all([
            prisma.orderReturn.findFirst({
              where: {
                orderId: order.id,
                actionType: "rearrange",
              },
              orderBy: { actionDate: "desc" },
              select: { id: true },
            }),
            prisma.orderExchange.findFirst({
              where: {
                companyId,
                OR: [
                  { replacementOrderId: order.id },
                  { replacementReference: order.name ?? "" },
                  { replacementReference: order.orderNumber ?? "" },
                  { replacementReference: order.shopifyOrderId },
                ],
              },
              orderBy: { createdAt: "desc" },
              include: {
                originalOrder: {
                  select: {
                    id: true,
                    name: true,
                    orderNumber: true,
                    shopifyOrderId: true,
                    totalPrice: true,
                  },
                },
                replacementOrder: {
                  select: {
                    id: true,
                    name: true,
                    orderNumber: true,
                    shopifyOrderId: true,
                    totalPrice: true,
                  },
                },
              },
            }),
          ])
        : [null, null] as const;

      const replacementOrderForExchange = exchange?.replacementOrder ?? {
        id: order.id,
        name: order.name,
        orderNumber: order.orderNumber,
        shopifyOrderId: order.shopifyOrderId,
        totalPrice: order.totalPrice,
      };
      const specialDeliveryData = exchange
        ? {
            deliveryKind: "exchange" as const,
            exchangeId: exchange.id,
            oldOrderLabel: exchange.originalOrder
              ? orderDisplayLabel(exchange.originalOrder)
              : exchange.originalReference,
            replacementOrderLabel: orderDisplayLabel(replacementOrderForExchange),
            requiresOldItemCollection: requiresOldItemCollection(exchange.reason),
            oldItemCollectionStatus: "pending" as const,
            oldItemCollectionRemark: null,
            exchangePaymentDifference: calculateExchangePaymentDifference({
              originalOrder: exchange.originalOrder,
              replacementOrder: replacementOrderForExchange,
            }),
          }
        : rearrangedReturn
          ? {
              deliveryKind: "rearranged" as const,
              exchangeId: null,
              oldOrderLabel: null,
              replacementOrderLabel: null,
              requiresOldItemCollection: false,
              oldItemCollectionStatus: "pending" as const,
              oldItemCollectionRemark: null,
              exchangePaymentDifference: null,
            }
          : {
              deliveryKind: "normal" as const,
              exchangeId: null,
              oldOrderLabel: null,
              replacementOrderLabel: null,
              requiresOldItemCollection: false,
              oldItemCollectionStatus: "pending" as const,
              oldItemCollectionRemark: null,
              exchangePaymentDifference: null,
            };

      const needsMarkReady =
        order.fulfillmentStage !== "ready_to_dispatch" ||
        !isExplicitlyPackageReady({
          packageReadyAt: order.packageReadyAt,
          lastPrintedAt: order.lastPrintedAt,
        });
      const userId = auth.context!.user!.id;

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          ...printFieldsOnDispatchIfUnprinted(order, userId, now),
          ...(needsMarkReady && {
            packageReadyAt: now,
            packageReadyById: userId,
            packageOnHoldAt: null,
            packageHoldReasonId: null,
          }),
          ...orderStageUpdate("dispatched", now),
          dispatchedAt: now,
          dispatchedById: auth.context!.user!.id,
          dispatchedByRiderId: dispatchToCustomer ? null : (data.riderId ?? null),
          dispatchedByCourierServiceId: dispatchToCustomer ? null : (data.courierServiceId ?? null),
          dispatchedToCustomer: dispatchToCustomer,
          deliveryOutcome: "pending",
          deliveryFailedReason: null,
          lastRiderUpdateAt: data.riderId ? now : null,
          riderDeliveryToken: dispatchToCustomer ? null : riderDeliveryToken,
        },
        include: {
          companyLocation: true,
          dispatchedByRider: { select: { name: true, mobile: true } },
        },
      });
      if (data.riderId) {
        await prisma.riderDeliveryTask.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            riderId: data.riderId,
            status: "assigned",
            ...specialDeliveryData,
            assignedAt: now,
            latestSyncAt: now,
          },
          update: {
            riderId: data.riderId,
            status: "assigned",
            ...specialDeliveryData,
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
        await prisma.riderDeliveryTask.deleteMany({
          where: { orderId: order.id },
        });
      }
      const orderNum = resolveOrderNumber(updated);
      const invoiceNum = resolveOrderInvoiceNumber(updated);
      const customerPhone = resolveCustomerPhone(updated);
      const dispatchDeliveryUrl = riderDeliveryToken ? getDeliveryUrl({ riderDeliveryToken }) : undefined;

      if (needsMarkReady) {
        sendOrderSms(companyId, order.id, "package_ready", {
          orderNumber: orderNum,
          invoiceNumber: invoiceNum,
          customerPhone,
          locationName: updated.companyLocation.name,
        }).catch((err) => console.error("[Order SMS] package_ready failed:", err));
      }

      sendOrderSms(companyId, order.id, "dispatched", {
        orderNumber: orderNum,
        invoiceNumber: invoiceNum,
        customerPhone,
        locationName: updated.companyLocation.name,
        deliveryUrl: dispatchDeliveryUrl,
      }).catch((err) => console.error("[Order SMS] dispatched failed:", err));
      if (data.riderId && riderDeliveryToken) {
        const rider = updated.dispatchedByRider as { name: string | null; mobile: string | null } | undefined;
        const deliveryUrl = getDeliveryUrl({ riderDeliveryToken });
        sendOrderSms(companyId, order.id, "rider_dispatched", {
          orderNumber: orderNum,
          invoiceNumber: invoiceNum,
          orderReference: [orderNum, invoiceNum].filter(Boolean).join(" / "),
          riderName: rider?.name ?? undefined,
          riderPhone: rider?.mobile ?? undefined,
          deliveryUrl,
        }).catch((err) => console.error("[Order SMS] rider_dispatched failed:", err));
      }
      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: needsMarkReady
          ? dispatchToCustomer
            ? `Dispatched order ${orderNum} to customer for pickup (auto marked package ready)`
            : `Dispatched order ${orderNum} (auto marked package ready)`
          : dispatchToCustomer
            ? `Dispatched order ${orderNum} to customer for pickup`
            : `Dispatched order ${orderNum}`,
        beforeStage: order.fulfillmentStage,
        afterStage: "dispatched",
        metadata: {
          action: data.action,
          riderId: data.riderId ?? null,
          courierServiceId: data.courierServiceId ?? null,
          dispatchToCustomer,
        },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "mark_invoice_complete") {
      const modeOverride = data.modeOfPayment?.trim();
      if (modeOverride) {
        const paymentModes = await listCompanyErpPaymentModes(companyId);
        if (!isAllowedCompanyErpPaymentMode(paymentModes, modeOverride)) {
          return NextResponse.json({ error: "Invalid ERP payment mode" }, { status: 400 });
        }
      }
      const outcome = await markOrderInvoiceComplete({
        companyId,
        orderId: order.id,
        userId: auth.context!.user!.id,
        modeOfPayment: modeOverride,
      });
      if (!outcome.success) {
        return NextResponse.json({ error: outcome.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        ...(outcome.erpPeError ? { erpPeError: outcome.erpPeError } : {}),
        ...(outcome.peStatus ? { peStatus: outcome.peStatus } : {}),
      });
    }

    if (data.action === "mark_delivered") {
      const userId = auth.context!.user!.id;
      const outcome = await markOrderDelivered({
        companyId,
        orderId: order.id,
        userId,
      });
      if (!outcome.success) {
        return NextResponse.json({ error: outcome.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        needsPaymentApproval: outcome.needsPaymentApproval,
      });
    }

    if (data.action === "revert_to_stage") {
      const targetStage = data.targetStage as FulfillmentStage;
      const currentStage = order.fulfillmentStage;
      const targetIdx = FULFILLMENT_STAGE_ORDER.indexOf(targetStage);
      const currentIdx = FULFILLMENT_STAGE_ORDER.indexOf(currentStage);
      if (targetIdx >= currentIdx) {
        return NextResponse.json(
          { error: "Target stage must be earlier than current stage" },
          { status: 400 }
        );
      }
      const requiredRevertPerms = getRequiredRevertPermissions(targetStage, currentStage);
      for (const perm of requiredRevertPerms) {
        if (!hasPermission(auth.context!, perm)) {
          return NextResponse.json(
            { error: "Permission denied: missing revert permission for intermediate stage" },
            { status: 403 }
          );
        }
      }
      const clearFromStageIdx = targetIdx + 1;
      const dispatchedIdx = FULFILLMENT_STAGE_ORDER.indexOf("dispatched");
      const readyIdx = FULFILLMENT_STAGE_ORDER.indexOf("ready_to_dispatch");
      // Special path: finance reverts a paid+delivered order back from invoice_complete.
      // Item is physically out with customer (not yet returned), so we track a "refunded" partial-void state.
      const isInvoiceCompleteRevert =
        currentStage === "invoice_complete" && targetStage === "delivery_complete";
      const shouldRecordReturn =
        !isInvoiceCompleteRevert &&
        currentIdx >= dispatchedIdx &&
        targetIdx >= readyIdx &&
        Boolean(order.dispatchedAt);
      const returnRemark = data.remarkTemplate
        ? buildReturnRemarkText({
            remarkTemplate: data.remarkTemplate,
            customRemark: data.revertReason,
          })
        : data.revertReason;
      if (data.remarkTemplate && !returnRemark) {
        return NextResponse.json({ error: "Custom remark is required for custom template" }, { status: 400 });
      }

      const revertStage = shouldRecordReturn ? "returned_to_store" : targetStage;
      const updateData: Parameters<typeof prisma.order.update>[0]["data"] = {
        ...orderStageUpdate(revertStage, now),
      };
      if (currentStage === "invoice_complete" && targetStage !== "invoice_complete") {
        updateData.fulfillmentStatus = "unfulfilled";
      }
      if (targetIdx <= FULFILLMENT_STAGE_ORDER.indexOf("dispatched")) {
        updateData.deliveryOutcome = "pending";
        updateData.deliveryFailedReason = null;
        updateData.lastRiderUpdateAt = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("sample_free_issue")) {
        updateData.sampleFreeIssueCompleteAt = null;
        updateData.sampleFreeIssueCompleteById = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("print")) {
        updateData.printCount = 0;
        updateData.lastPrintedAt = null;
        updateData.lastPrintedById = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("ready_to_dispatch")) {
        updateData.packageReadyAt = null;
        updateData.packageReadyById = null;
        updateData.packageOnHoldAt = null;
        updateData.packageHoldReasonId = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("dispatched")) {
        updateData.dispatchedAt = null;
        updateData.dispatchedById = null;
        updateData.dispatchedByRiderId = null;
        updateData.dispatchedByCourierServiceId = null;
        updateData.dispatchedToCustomer = false;
        updateData.riderDeliveryToken = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("delivery_complete")) {
        updateData.deliveryCompleteAt = null;
        updateData.deliveryCompleteById = null;
      }
      if (clearFromStageIdx <= FULFILLMENT_STAGE_ORDER.indexOf("invoice_complete")) {
        updateData.invoiceCompleteAt = null;
        updateData.invoiceCompleteById = null;
      }
      if (isInvoiceCompleteRevert) {
        updateData.revertedFromInvoiceCompleteAt = now;
        updateData.revertedFromInvoiceCompleteById = auth.context!.user!.id;
        updateData.financialStatus = "refunded";
      }
      if (shouldRecordReturn) {
        updateData.fulfillmentStatus = "unfulfilled";
        updateData.packageReadyAt = null;
        updateData.packageReadyById = null;
        updateData.packageOnHoldAt = null;
        updateData.packageHoldReasonId = null;
        updateData.dispatchedAt = null;
        updateData.dispatchedById = null;
        updateData.dispatchedByRiderId = null;
        updateData.dispatchedByCourierServiceId = null;
        updateData.dispatchedToCustomer = false;
        updateData.riderDeliveryToken = null;
        updateData.deliveryCompleteAt = null;
        updateData.deliveryCompleteById = null;
        updateData.invoiceCompleteAt = null;
        updateData.invoiceCompleteById = null;
        updateData.deliveryOutcome = "pending";
        updateData.deliveryFailedReason = null;
        updateData.lastRiderUpdateAt = null;
      }
      await prisma.order.update({
        where: { id: order.id },
        data: updateData,
      });
      if (shouldRecordReturn) {
        const shipping = getShippingServiceForReturn(order);
        const existingPendingReturn = await prisma.orderReturn.findFirst({
          where: { orderId: order.id, companyId, actionStatus: "pending" },
          select: { id: true },
        });
        if (!existingPendingReturn) {
          const createdReturn = await prisma.orderReturn.create({
            data: {
              companyId,
              orderId: order.id,
              merchantUserId: order.assignedMerchantId,
              dispatchedAt: order.dispatchedAt!,
              returnDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
              shippingServiceType: shipping.type,
              shippingServiceName: shipping.name,
              riderId: order.dispatchedByRiderId,
              courierServiceId: order.dispatchedByCourierServiceId,
              returnedById: auth.context!.user!.id,
              returnRemark: returnRemark!,
              remarkTemplate: data.remarkTemplate ?? null,
              actionStatus: "pending",
            },
          });
          await writeAuditLog({
            companyId,
            actorUserId: auth.context!.user!.id,
            module: "orders",
            action: "returned_order_recorded",
            entityType: "OrderReturn",
            entityId: createdReturn.id,
            summary: `Recorded return from order revert for ${order.orderNumber ?? order.name ?? order.id}`,
            afterData: {
              orderId: order.id,
              returnRemark,
              remarkTemplate: data.remarkTemplate ?? null,
              source: "revert_to_stage",
            },
          });
        }
        await prisma.riderDeliveryTask.deleteMany({ where: { orderId: order.id } });
      } else if (targetIdx < FULFILLMENT_STAGE_ORDER.indexOf("dispatched")) {
        await prisma.riderDeliveryTask.deleteMany({
          where: { orderId: order.id },
        });
      } else {
        await prisma.riderDeliveryTask.updateMany({
          where: { orderId: order.id },
          data: {
            status: "assigned",
            acceptedAt: null,
            arrivedAt: null,
            completedAt: null,
            failedAt: null,
            failureReason: null,
            latestSyncAt: null,
          },
        });
      }

      if (isInvoiceCompleteRevert) {
        const existingRevertReturn = await prisma.orderReturn.findFirst({
          where: { orderId: order.id, companyId, remarkTemplate: "invoice_revert" },
          select: { id: true },
        });
        if (!existingRevertReturn) {
          const shipping = getShippingServiceForReturn(order);
          const createdReturn = await prisma.orderReturn.create({
            data: {
              companyId,
              orderId: order.id,
              merchantUserId: order.assignedMerchantId,
              dispatchedAt: order.dispatchedAt ?? now,
              returnDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
              shippingServiceType: shipping.type,
              shippingServiceName: shipping.name,
              riderId: order.dispatchedByRiderId,
              courierServiceId: order.dispatchedByCourierServiceId,
              returnedById: auth.context!.user!.id,
              returnRemark: data.revertReason,
              remarkTemplate: "invoice_revert",
              actionStatus: "pending",
            },
          });
          await writeAuditLog({
            companyId,
            actorUserId: auth.context!.user!.id,
            module: "orders",
            action: "returned_order_recorded",
            entityType: "OrderReturn",
            entityId: createdReturn.id,
            summary: `Finance reverted order ${order.orderNumber ?? order.name ?? order.id} from invoice complete — credit refund pending`,
            afterData: { orderId: order.id, remarkTemplate: "invoice_revert", source: "invoice_complete_revert" },
          });
        }
        // Create ERP credit note — awaited; failure surfaced as warning flag (order is already reverted in DB)
        let erpCreditNoteFailed = false;
        let erpCreditNoteError: string | undefined;
        try {
          const withLocation = await prisma.order.findUnique({
            where: { id: order.id },
            include: { companyLocation: { include: { erpnextInstance: true } } },
          });
          if (withLocation?.companyLocation) {
            await createErpnextCreditNote(
              { ...order, erpnextInvoiceId: withLocation.erpnextInvoiceId },
              withLocation.companyLocation,
            );
          }
        } catch (err) {
          console.error("[ERPNext] createErpnextCreditNote failed:", err);
          erpCreditNoteFailed = true;
          erpCreditNoteError = err instanceof Error ? err.message : String(err);
        }

        await logOrderFulfillmentAudit({
          companyId,
          actorUserId: auth.context!.user!.id,
          orderId: order.id,
          summary: `Reverted order ${order.orderNumber ?? order.name ?? order.id} to ${targetStage}`,
          beforeStage: order.fulfillmentStage,
          afterStage: targetStage,
          metadata: { action: data.action, targetStage, returnRecorded: shouldRecordReturn, revertReason: data.revertReason },
        });
        return NextResponse.json({ success: true, erpCreditNoteFailed, erpCreditNoteError });
      }

      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Reverted order ${order.orderNumber ?? order.name ?? order.id} to ${targetStage}`,
        beforeStage: order.fulfillmentStage,
        afterStage: targetStage,
        metadata: { action: data.action, targetStage, returnRecorded: shouldRecordReturn, revertReason: data.revertReason },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "cancel_order") {
      const cancelableStages = ["order_received", "sample_free_issue", "print", "ready_to_dispatch"] as const;
      if (!(cancelableStages as readonly string[]).includes(order.fulfillmentStage)) {
        return NextResponse.json(
          { error: "Orders can only be cancelled before dispatch" },
          { status: 400 }
        );
      }
      if (order.financialStatus?.toLowerCase() === "voided") {
        return NextResponse.json({ error: "Order is already cancelled" }, { status: 400 });
      }

      // Vault OS has no Shopify Admin API — real Shopify orders must be cancelled in Shopify.
      if (shouldBlockShopifyCancelInOs(order.shopifyOrderId)) {
        return NextResponse.json(
          { error: VAULT_SHOPIFY_CANCEL_BLOCKED_MESSAGE },
          { status: 400 }
        );
      }

      const orderWithLocation = await prisma.order.findUnique({
        where: { id: order.id },
        include: { companyLocation: { include: { erpnextInstance: true } } },
      });
      const location = orderWithLocation?.companyLocation;

      // Pre-paid orders (KOKO, bank transfer, CC Checkout) require finance approval to cancel —
      // finance must process the credit note in ERPNext and then approve in Cosmo OS.
      const gateway = (order.paymentGatewayPrimary ?? "").toLowerCase().trim();
      const isPaidCancelableGateway =
        gateway.includes("koko") ||
        gateway.includes("bank") ||
        gateway === "cc" ||
        gateway === "cc checkout" ||
        gateway.includes("webxpay");
      const requiresFinanceApproval =
        order.financialStatus?.toLowerCase() === "paid" && isPaidCancelableGateway;

      if (requiresFinanceApproval) {
        const invoiceLabel = order.name ?? order.orderNumber ?? order.shopifyOrderId ?? order.id;
        const approval = await createOrGetOrderCancelApproval({
          companyId,
          orderId: order.id,
          requestedById: auth.context!.user!.id,
          cancelReason: data.reason,
          invoiceLabel,
          amount: order.totalPrice?.toString() ?? "0",
          companyLocationId: order.companyLocationId,
        });

        await writeAuditLog({
          companyId,
          actorUserId: auth.context!.user!.id,
          module: "orders",
          action: "order_cancel_requested",
          entityType: "Order",
          entityId: order.id,
          summary: `Cancel approval requested for order ${invoiceLabel}: ${data.reason}`,
          beforeData: { fulfillmentStage: order.fulfillmentStage, financialStatus: order.financialStatus },
          afterData: { cancelReason: data.reason, approvalId: approval.id },
        });

        return NextResponse.json({ requiresApproval: true, approvalId: approval.id });
      }

      // Unpaid orders — cancel directly without finance approval.
      // Cancel in Shopify first — fatal; if this fails we don't mark as voided.
      // ERP-native orders use an "erp-" prefixed shopifyOrderId and have no real Shopify order — skip.
      if (isRealShopifyOrderId(order.shopifyOrderId) && location?.shopifyAdminStoreHandle) {
        await cancelShopifyOrder(order.shopifyOrderId!, location.shopifyAdminStoreHandle);
        console.log(`[Cancel] Shopify order ${order.shopifyOrderId} cancelled`);
      } else {
        console.warn(`[Cancel] Skipping Shopify cancel for order ${order.id} (ERP-native or no store handle)`);
      }

      // Cancel ERP Sales Invoice if one exists — non-fatal
      if (location && order.erpnextInvoiceId && order.erpnextInvoiceId !== "pending" && order.erpnextInvoiceId !== "pending_approval") {
        try {
          const isErpNative = order.shopifyOrderId?.startsWith("erp-");
          await cancelErpnextSalesInvoice(
            order.name ?? order.shopifyOrderId,
            location,
            isErpNative ? { directInvoiceName: order.erpnextInvoiceId } : undefined,
          );
          console.log(`[Cancel] ERP SI cancelled for order ${order.id}`);
        } catch (err) {
          console.error(`[Cancel] ERP SI cancel failed (non-fatal) for order ${order.id}:`, err);
        }
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          financialStatus: "voided",
          cancelledAt: now,
          cancelledById: auth.context!.user!.id,
          cancelReason: data.reason,
        },
      });

      await writeAuditLog({
        companyId,
        actorUserId: auth.context!.user!.id,
        module: "orders",
        action: "order_cancelled",
        entityType: "Order",
        entityId: order.id,
        summary: `Cancelled order ${order.orderNumber ?? order.name ?? order.id}: ${data.reason}`,
        beforeData: { fulfillmentStage: order.fulfillmentStage, financialStatus: order.financialStatus },
        afterData: { financialStatus: "voided", cancelReason: data.reason },
      });

      return NextResponse.json({ success: true });
    }

    if (data.action === "complete_pos") {
      if (order.sourceName !== "pos") {
        return NextResponse.json(
          { error: "Complete POS is only for POS orders" },
          { status: 400 }
        );
      }
      const isPaid = order.financialStatus?.toLowerCase() === "paid";
      const userId = auth.context!.user!.id;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          ...orderStageUpdate("delivery_complete", now),
          fulfillmentStatus: "fulfilled",
          printCount: { increment: 1 },
          packageReadyAt: now,
          packageReadyById: userId,
          packageOnHoldAt: null,
          packageHoldReasonId: null,
          dispatchedAt: now,
          dispatchedById: userId,
          dispatchedByRiderId: null,
          dispatchedByCourierServiceId: null,
          deliveryOutcome: "delivered",
          deliveryFailedReason: null,
          invoiceCompleteAt: isPaid ? now : now,
          invoiceCompleteById: userId,
          deliveryCompleteAt: now,
          deliveryCompleteById: userId,
          lastRiderUpdateAt: null,
          riderDeliveryToken: null,
        },
      });
      await prisma.riderDeliveryTask.deleteMany({
        where: { orderId: order.id },
      });
      await logOrderFulfillmentAudit({
        companyId,
        actorUserId: auth.context!.user!.id,
        orderId: order.id,
        summary: `Completed POS order ${order.orderNumber ?? order.name ?? order.id}`,
        beforeStage: order.fulfillmentStage,
        afterStage: "delivery_complete",
        metadata: { action: data.action },
      });
      return NextResponse.json({ success: true });
    }
  } catch (err) {
    console.error("Fulfillment update error:", err);
    return NextResponse.json(
      { error: "Failed to update fulfillment" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}









