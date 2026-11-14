import "server-only";

import { createPaymentMethodChangeApproval, PAYMENT_METHOD_CHANGE_APPROVAL } from "@/lib/approval-workflow";
import {
  classifyCollectionPaymentKind,
  collectionGatewayForTarget,
  isRiderLinkPaymentChangeAllowed,
  type RiderLinkPaymentTarget,
} from "@/lib/collection-payment-method";
import { formatBusinessOrderNumber } from "@/lib/order-display-label";
import { paymentMethodChangeTargetLabel } from "@/lib/payment-method-label";
import { prisma } from "@/lib/prisma";

export async function loadPendingPaymentMethodChangeByOrderIds(
  orderIds: string[],
): Promise<Map<string, "bank_transfer" | "koko" | "mintpay">> {
  const result = new Map<string, "bank_transfer" | "koko" | "mintpay">();
  if (orderIds.length === 0) return result;

  const rows = await prisma.approvalRequest.findMany({
    where: {
      orderId: { in: orderIds },
      type: PAYMENT_METHOD_CHANGE_APPROVAL,
      status: "pending",
    },
    orderBy: { createdAt: "desc" },
    select: { orderId: true, requestNote: true },
  });

  for (const row of rows) {
    if (!row.orderId || result.has(row.orderId)) continue;
    const note = row.requestNote?.trim().toLowerCase() ?? "";
    if (note.startsWith("bank transfer")) result.set(row.orderId, "bank_transfer");
    else if (note.includes("mintpay")) result.set(row.orderId, "mintpay");
    else if (note.startsWith("koko")) result.set(row.orderId, "koko");
  }
  return result;
}

export async function applyRiderLinkPaymentChange(input: {
  orderId: string;
  companyId: string;
  target: RiderLinkPaymentTarget;
  requestedById: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      totalPrice: true,
      currency: true,
      companyLocationId: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
    },
  });
  if (!order) return { ok: false, error: "Order not found", status: 404 };

  const current = classifyCollectionPaymentKind(order);
  if (!isRiderLinkPaymentChangeAllowed({ current, target: input.target })) {
    return { ok: false, error: "That payment method cannot be changed from this link", status: 400 };
  }

  if (input.target === "bank_transfer") {
    const invoiceLabel = formatBusinessOrderNumber(order);
    const amount = `${order.currency ?? ""} ${order.totalPrice}`.trim();
    await createPaymentMethodChangeApproval({
      companyId: input.companyId,
      orderId: order.id,
      requestedById: input.requestedById,
      invoiceLabel,
      targetPaymentMethod: paymentMethodChangeTargetLabel("bank_transfer"),
      amount,
      companyLocationId: order.companyLocationId,
    });
    return { ok: true };
  }

  const gateway = collectionGatewayForTarget(input.target);
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentGatewayPrimary: gateway,
      paymentGatewayNames: [gateway],
    },
  });
  return { ok: true };
}

export async function applyFinanceCollectionPaymentMethod(input: {
  orderId: string;
  target: Exclude<RiderLinkPaymentTarget, "bank_transfer">;
}): Promise<void> {
  const gateway = collectionGatewayForTarget(input.target);
  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      paymentGatewayPrimary: gateway,
      paymentGatewayNames: [gateway],
    },
  });
}
