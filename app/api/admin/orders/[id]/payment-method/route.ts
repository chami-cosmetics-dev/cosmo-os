import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrderPaymentGatewayColumnState } from "@/lib/order-payment-gateway-compat";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
});

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isCodOrder(order: {
  financialStatus: string | null;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
}) {
  const candidates = [
    order.paymentGatewayPrimary,
    ...order.paymentGatewayNames,
    order.financialStatus,
  ].map(normalizeText);

  if (candidates.some((v) => v.includes("bank"))) return false;
  if (candidates.some((v) => v.includes("card") || v.includes("paid"))) return false;
  return candidates.some((v) => v.includes("cod")) || normalizeText(order.financialStatus) === "pending";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("finance.approvals.manage");
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
      financialStatus: true,
      fulfillmentStage: true,
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

  if (!isCodOrder(orderForCheck)) {
    return NextResponse.json({ error: "Order is not a COD order" }, { status: 400 });
  }

  const now = new Date();
  const note = parsed.data.note?.trim() || null;
  const remarkContent = note
    ? `Payment method changed from COD to Bank Transfer by finance.\n${note}`
    : "Payment method changed from COD to Bank Transfer by finance.";

  await prisma.$transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};
    if (gatewayColumns.hasPaymentGatewayNames) {
      updateData.paymentGatewayNames = ["bank_transfer"];
    }
    if (gatewayColumns.hasPaymentGatewayPrimary) {
      updateData.paymentGatewayPrimary = "bank_transfer";
    }
    updateData.updatedAt = now;

    await tx.order.update({
      where: { id: order.id },
      data: updateData,
    });

    await tx.orderRemark.create({
      data: {
        orderId: order.id,
        stage: order.fulfillmentStage ?? "order_received",
        type: "internal",
        content: remarkContent,
        addedById: userId,
        showOnInvoice: false,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
