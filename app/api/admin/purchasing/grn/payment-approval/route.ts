import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveViewerFinanceLocationIds } from "@/lib/approval-workflow";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const paymentApprovalSchema = z.object({
  companyId: z.string().min(1),
  purchaseReceiptName: z.string().min(1),
  purchaseReceiptIsBackfill: z.boolean(),
  action: z.enum(["approve", "paid"]),
});

export async function POST(request: NextRequest) {
  const parsed = paymentApprovalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment approval" }, { status: 400 });

  const context = await getCurrentUserContext();
  const user = context?.user;
  if (!user?.companyId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const input = parsed.data;
  const canManage = hasPermission(context, "purchasing.grn.payment_approval.manage");
  const canRead =
    canManage || hasPermission(context, "purchasing.grn.payment_approval.read");
  if ((input.action === "approve" && !canManage) || (input.action === "paid" && !canRead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const receipt = input.purchaseReceiptIsBackfill
    ? await prisma.grnBackfillPurchaseReceipt.findFirst({
        where: {
          companyId: input.companyId,
          name: input.purchaseReceiptName,
          deletedAt: null,
          docstatus: { not: 2 },
          receivedAt: { not: null },
        },
        select: { name: true, companyLocationId: true },
      })
    : await prisma.grnPurchaseReceipt.findFirst({
        where: {
          companyId: input.companyId,
          name: input.purchaseReceiptName,
          deletedAt: null,
          docstatus: { not: 2 },
          receivedAt: { not: null },
        },
        select: { name: true, companyLocationId: true },
      });
  if (!receipt) {
    return NextResponse.json({ error: "Only active GRN-received purchase receipts can be approved for payment" }, { status: 409 });
  }

  if (!canManage) {
    if (input.companyId !== user.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const allowedLocationIds = await resolveViewerFinanceLocationIds(
      user.id,
      user.companyId,
      context?.roleNames ?? [],
    );
    if (allowedLocationIds !== null && !allowedLocationIds.includes(receipt.companyLocationId ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (input.action === "approve") {
    await prisma.grnPaymentApproval.createMany({
      data: [{
        companyId: input.companyId,
        purchaseReceiptName: input.purchaseReceiptName,
        purchaseReceiptIsBackfill: input.purchaseReceiptIsBackfill,
        approvedById: user.id,
      }],
      skipDuplicates: true,
    });
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.grnPaymentApproval.updateMany({
    where: {
      companyId: input.companyId,
      purchaseReceiptName: input.purchaseReceiptName,
      purchaseReceiptIsBackfill: input.purchaseReceiptIsBackfill,
      paidAt: null,
    },
    data: { paidAt: new Date(), paidById: user.id },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Payment must be approved before it can be marked paid" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
