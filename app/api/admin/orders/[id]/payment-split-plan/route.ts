import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  APPROVAL_SPLIT_BANK_TRANSFER,
  APPROVAL_SPLIT_KOKO,
  buildApprovalSplitRequestNote,
  validateApprovalSplitAmounts,
} from "@/lib/approval-payment-split";
import { ORDER_PAYMENT_APPROVAL } from "@/lib/approval-workflow";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kokoAmount: z.number().finite().positive(),
  bankTransferAmount: z.number().finite().positive(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyPermission([
    "orders.update_payment_method",
    "fulfillment.sample_free_issue.manage",
  ]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  const userId = auth.context?.user?.id;
  if (!companyId || !userId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter valid KOKO and Bank Transfer amounts.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    select: {
      id: true,
      sourceName: true,
      totalPrice: true,
      currency: true,
      financialStatus: true,
      fulfillmentStage: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      approvalRequests: {
        where: { type: ORDER_PAYMENT_APPROVAL, status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          paymentLines: {
            select: { erpPaymentEntryName: true },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!order.sourceName.startsWith("erpnext")) {
    return NextResponse.json(
      { error: "Split payment planning is currently available for ERP orders only." },
      { status: 400 },
    );
  }
  if (order.financialStatus === "paid" || order.financialStatus === "voided") {
    return NextResponse.json({ error: "Paid or voided orders cannot be changed." }, { status: 400 });
  }
  if (!["order_received", "sample_free_issue"].includes(order.fulfillmentStage)) {
    return NextResponse.json(
      { error: "Split payment must be configured before printing or dispatch." },
      { status: 400 },
    );
  }

  const gateways = [order.paymentGatewayPrimary, ...order.paymentGatewayNames]
    .map((gateway) => gateway?.trim().toLowerCase() ?? "")
    .filter(Boolean);
  if (!gateways.some((gateway) => gateway.includes("koko") || gateway.includes("bank"))) {
    return NextResponse.json(
      { error: "Only KOKO or Bank Transfer approval orders can be marked as split payment." },
      { status: 400 },
    );
  }

  const approval = order.approvalRequests[0];
  if (!approval) {
    return NextResponse.json(
      { error: "No pending order payment approval found." },
      { status: 409 },
    );
  }
  if (approval.paymentLines.some((line) => line.erpPaymentEntryName)) {
    return NextResponse.json(
      { error: "Split amounts cannot be changed after an ERP Payment Entry was created." },
      { status: 409 },
    );
  }

  const invoiceTotal = Number(order.totalPrice);
  const validationError = validateApprovalSplitAmounts({
    kokoAmount: parsed.data.kokoAmount,
    bankTransferAmount: parsed.data.bankTransferAmount,
    invoiceTotal,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const requestNote = buildApprovalSplitRequestNote({
    kokoAmount: parsed.data.kokoAmount,
    bankTransferAmount: parsed.data.bankTransferAmount,
    invoiceTotal,
    currency: order.currency,
  });

  await prisma.$transaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: approval.id },
      data: { requestNote, requestedById: userId },
    });
    await tx.approvalPaymentLine.deleteMany({
      where: {
        approvalRequestId: approval.id,
        paymentMethod: { notIn: [APPROVAL_SPLIT_KOKO, APPROVAL_SPLIT_BANK_TRANSFER] },
      },
    });
    await Promise.all([
      tx.approvalPaymentLine.upsert({
        where: {
          approvalRequestId_paymentMethod: {
            approvalRequestId: approval.id,
            paymentMethod: APPROVAL_SPLIT_KOKO,
          },
        },
        create: {
          approvalRequestId: approval.id,
          paymentMethod: APPROVAL_SPLIT_KOKO,
          amount: parsed.data.kokoAmount,
        },
        update: { amount: parsed.data.kokoAmount },
      }),
      tx.approvalPaymentLine.upsert({
        where: {
          approvalRequestId_paymentMethod: {
            approvalRequestId: approval.id,
            paymentMethod: APPROVAL_SPLIT_BANK_TRANSFER,
          },
        },
        create: {
          approvalRequestId: approval.id,
          paymentMethod: APPROVAL_SPLIT_BANK_TRANSFER,
          amount: parsed.data.bankTransferAmount,
        },
        update: { amount: parsed.data.bankTransferAmount },
      }),
    ]);
  });

  return NextResponse.json({
    ok: true,
    approvalId: approval.id,
    requestNote,
    paymentLines: [
      { paymentMethod: APPROVAL_SPLIT_KOKO, amount: parsed.data.kokoAmount.toFixed(2) },
      {
        paymentMethod: APPROVAL_SPLIT_BANK_TRANSFER,
        amount: parsed.data.bankTransferAmount.toFixed(2),
      },
    ],
  });
}
