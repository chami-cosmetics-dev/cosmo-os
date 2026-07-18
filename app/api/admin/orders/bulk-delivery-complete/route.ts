import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getFinancePaymentApprovalBlockReason } from "@/lib/approval-workflow";
import { markOrderDelivered } from "@/lib/mark-order-delivered";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const schema = z.object({
  orderIds: z.array(cuidSchema).min(1).max(50),
});

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getCompanyId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAnyPermission([
    "fulfillment.delivery_invoice.mark_delivered",
  ]);
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

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const userId = auth.context!.user!.id;
  const results: Array<{
    orderId: string;
    ref: string;
    success: boolean;
    error?: string;
    needsPaymentApproval?: boolean;
    afterStage?: string;
  }> = [];

  for (const orderId of parsed.data.orderIds) {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, companyId },
        select: {
          id: true,
          name: true,
          orderNumber: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
          erpnextInvoiceId: true,
        },
      });
      const ref = order?.name ?? order?.orderNumber ?? orderId;
      if (!order) {
        results.push({ orderId, ref, success: false, error: "Order not found" });
        continue;
      }
      const financeBlock = await getFinancePaymentApprovalBlockReason({
        id: order.id,
        paymentGatewayPrimary: order.paymentGatewayPrimary,
        paymentGatewayNames: order.paymentGatewayNames ?? [],
        erpnextInvoiceId: order.erpnextInvoiceId,
      });
      if (financeBlock) {
        results.push({ orderId, ref, success: false, error: financeBlock });
        continue;
      }

      const outcome = await markOrderDelivered({
        companyId,
        orderId,
        userId,
        bulk: true,
      });
      if (outcome.success) {
        results.push({
          orderId,
          ref: outcome.ref,
          success: true,
          needsPaymentApproval: outcome.needsPaymentApproval,
          afterStage: outcome.afterStage,
        });
      } else {
        results.push({
          orderId,
          ref: outcome.ref,
          success: false,
          error: outcome.error,
        });
      }
    } catch (err) {
      console.error("[bulk-delivery-complete] error for orderId", orderId, err);
      results.push({
        orderId,
        ref: orderId,
        success: false,
        error: "Internal error",
      });
    }
  }

  return NextResponse.json({ results });
}
