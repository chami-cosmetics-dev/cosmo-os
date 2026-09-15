import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildOrderCustomerPhoneCorrectionData,
  resolveCorrectedOrderCustomerPhone,
} from "@/lib/order-customer-phone-correction";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z.string().trim().min(1).max(LIMITS.mobile.max),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("failed_webhooks.retry");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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

  const resolved = resolveCorrectedOrderCustomerPhone(parsed.data.phone);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    select: {
      id: true,
      customerPhone: true,
      shippingAddress: true,
      billingAddress: true,
      rawPayload: true,
      erpnextSyncError: true,
      erpnextInvoiceId: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const isZombiePending = order.erpnextInvoiceId === "pending" && !order.erpnextSyncError;
  const isLegacyPendingApprovalPlaceholder = order.erpnextInvoiceId === "pending_approval";
  if (!order.erpnextSyncError && !isZombiePending && !isLegacyPendingApprovalPlaceholder) {
    return NextResponse.json(
      { error: "Phone correction is only available for failed ERP sync orders" },
      { status: 400 },
    );
  }

  const updateData = buildOrderCustomerPhoneCorrectionData({
    phone: resolved.phone,
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    rawPayload: order.rawPayload,
  });

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: updateData,
    select: { id: true, customerPhone: true },
  });

  return NextResponse.json({
    ok: true,
    message: "Customer phone updated",
    customerPhone: updated.customerPhone,
  });
}
