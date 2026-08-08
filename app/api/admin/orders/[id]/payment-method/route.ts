import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createPaymentMethodChangeApproval } from "@/lib/approval-workflow";
import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { canRequestPaymentMethodChange } from "@/lib/payment-method-label";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
  targetPaymentMethod: z.enum(["bank_transfer", "koko"]).optional().default("bank_transfer"),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("orders.update_payment_method");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const gatewayColumns = await getOrderPaymentGatewayColumnState();
  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      financialStatus: true,
      totalPrice: true,
      currency: true,
      companyLocationId: true,
      ...(gatewayColumns.hasPaymentGatewayNames ? { paymentGatewayNames: true } : {}),
      ...(gatewayColumns.hasPaymentGatewayPrimary ? { paymentGatewayPrimary: true } : {}),
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const orderForCheck = {
    financialStatus: order.financialStatus,
    paymentGatewayPrimary: gatewayColumns.hasPaymentGatewayPrimary
      ? ((order as Record<string, unknown>).paymentGatewayPrimary as string | null ?? null)
      : null,
    paymentGatewayNames: gatewayColumns.hasPaymentGatewayNames
      ? ((order as Record<string, unknown>).paymentGatewayNames as string[] ?? [])
      : [],
  };

  if (!canRequestPaymentMethodChange(orderForCheck)) {
    return NextResponse.json(
      { error: "Order payment method cannot be changed (only COD / Cash orders)" },
      { status: 400 },
    );
  }

  const { targetPaymentMethod } = parsed.data;

  const targetPaymentMethodLabel = targetPaymentMethod === "koko" ? "KOKO" : "Bank Transfer";
  const invoiceLabel = order.name ?? order.orderNumber ?? order.shopifyOrderId ?? "order";
  const amount = order.totalPrice != null ? `${order.currency ?? ""} ${order.totalPrice}`.trim() : "unknown";
  const approval = await createPaymentMethodChangeApproval({
    companyId,
    orderId: order.id,
    requestedById: userId,
    invoiceLabel,
    targetPaymentMethod: targetPaymentMethodLabel,
    amount,
    companyLocationId: order.companyLocationId,
  });
  return NextResponse.json({ ok: true, pendingApproval: true, approvalId: approval.id });
}
