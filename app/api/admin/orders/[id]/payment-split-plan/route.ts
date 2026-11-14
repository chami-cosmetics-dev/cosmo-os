import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  APPROVAL_SPLIT_BANK_TRANSFER,
  APPROVAL_SPLIT_CARD,
  APPROVAL_SPLIT_CASH,
  APPROVAL_SPLIT_KOKO,
  APPROVAL_SPLIT_MINTPAY,
  buildApprovalSplitRequestNote,
  isApprovalSplitPaymentMethod,
  isDoorCollectionSplitPair,
  orderHasSplitPaymentEligibleGateway,
  sortApprovalSplitLines,
  splitIncludesKoko,
  validateApprovalSplitAmounts,
  type ApprovalSplitAmountLine,
} from "@/lib/approval-payment-split";
import {
  createOrGetOrderPaymentApproval,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { isSplitPaymentEligibleSource } from "@/lib/koko-order";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const splitMethodSchema = z.enum([
  APPROVAL_SPLIT_KOKO,
  APPROVAL_SPLIT_BANK_TRANSFER,
  APPROVAL_SPLIT_MINTPAY,
  APPROVAL_SPLIT_CARD,
  APPROVAL_SPLIT_CASH,
]);

const bodySchema = z.object({
  lines: z
    .array(
      z.object({
        paymentMethod: splitMethodSchema,
        amount: z.number().finite().positive(),
      }),
    )
    .length(2),
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
      { error: "Enter two valid split payment amounts.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const lines: ApprovalSplitAmountLine[] = parsed.data.lines.map((line) => ({
    paymentMethod: line.paymentMethod,
    amount: line.amount,
  }));
  if (lines.some((line) => !isApprovalSplitPaymentMethod(line.paymentMethod))) {
    return NextResponse.json({ error: "Invalid split payment method." }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      companyLocationId: true,
      sourceName: true,
      totalPrice: true,
      currency: true,
      financialStatus: true,
      fulfillmentStage: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      approvalRequests: {
        where: {
          type: ORDER_PAYMENT_APPROVAL,
          status: { in: ["pending", "approved"] },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          paymentLines: {
            select: { paymentMethod: true, erpPaymentEntryName: true },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!isSplitPaymentEligibleSource(order.sourceName)) {
    return NextResponse.json(
      { error: "Split payment planning is available for ERP and Shopify orders only." },
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

  if (
    !orderHasSplitPaymentEligibleGateway({
      paymentGatewayPrimary: order.paymentGatewayPrimary,
      paymentGatewayNames: order.paymentGatewayNames,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "Only KOKO, Bank Transfer, or Cash/COD orders can be marked as split payment.",
      },
      { status: 400 },
    );
  }

  const editableApproval = order.approvalRequests.find((row) => {
    if (row.paymentLines.some((line) => line.erpPaymentEntryName)) return false;
    if (row.status === "pending") return true;
    // Approved Cash + Card door-collection plans stay editable until PEs exist.
    return isDoorCollectionSplitPair(row.paymentLines.map((line) => line.paymentMethod));
  });

  let approval = editableApproval
    ? { id: editableApproval.id, paymentLines: editableApproval.paymentLines }
    : null;
  if (!approval) {
    const created = await createOrGetOrderPaymentApproval({
      companyId,
      orderId: order.id,
      requestedById: userId,
      invoiceLabel: order.name ?? order.orderNumber ?? order.shopifyOrderId ?? order.id,
      paymentType: order.paymentGatewayPrimary ?? "split payment",
      amount: order.totalPrice.toString(),
      companyLocationId: order.companyLocationId,
    });
    if (created.status !== "pending") {
      return NextResponse.json(
        { error: "Finance already approved this order." },
        { status: 409 },
      );
    }
    approval = { id: created.id, paymentLines: [] };
  }
  if (approval.paymentLines.some((line) => line.erpPaymentEntryName)) {
    return NextResponse.json(
      { error: "Split amounts cannot be changed after an ERP Payment Entry was created." },
      { status: 409 },
    );
  }

  const invoiceTotal = Number(order.totalPrice);
  const validationError = validateApprovalSplitAmounts({
    lines,
    invoiceTotal,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const orderedLines = sortApprovalSplitLines(lines);
  const requestNote = buildApprovalSplitRequestNote({
    lines: orderedLines,
    invoiceTotal,
    currency: order.currency,
  });
  const keepMethods = orderedLines.map((line) => line.paymentMethod);
  const doorCollection = isDoorCollectionSplitPair(keepMethods);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: approval.id },
      data: {
        requestNote,
        requestedById: userId,
        ...(splitIncludesKoko(keepMethods)
          ? {}
          : { kokoReference: null, multipleKokoPayments: false }),
        // Cash + Card: record plan only — both collected after delivery; finance at invoice complete.
        ...(doorCollection
          ? {
              status: "approved" as const,
              reviewNote:
                "Cash + Card door-collection plan. Collect both at delivery; finance confirms at invoice complete.",
              reviewedAt: now,
              reviewedById: userId,
            }
          : {
              status: "pending" as const,
              reviewNote: null,
              reviewedAt: null,
              reviewedById: null,
            }),
      },
    });
    await tx.approvalPaymentLine.deleteMany({
      where: {
        approvalRequestId: approval.id,
        paymentMethod: { notIn: keepMethods },
      },
    });
    await Promise.all(
      orderedLines.map((line) =>
        tx.approvalPaymentLine.upsert({
          where: {
            approvalRequestId_paymentMethod: {
              approvalRequestId: approval.id,
              paymentMethod: line.paymentMethod,
            },
          },
          create: {
            approvalRequestId: approval.id,
            paymentMethod: line.paymentMethod,
            amount: line.amount,
          },
          update: { amount: line.amount },
        }),
      ),
    );
  });

  return NextResponse.json({
    ok: true,
    approvalId: approval.id,
    requestNote,
    doorCollection,
    paymentLines: orderedLines.map((line) => ({
      paymentMethod: line.paymentMethod,
      amount: line.amount.toFixed(2),
    })),
  });
}
