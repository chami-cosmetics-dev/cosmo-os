import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { attachPendingSupplierStockReturnPurchaseInvoices } from "@/lib/grn";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  purchaseReceiptName: z.string().min(1),
  purchaseReceiptIsBackfill: z.boolean().optional().default(false),
  supplierStockReturnName: z.string().min(1),
  supplierStockReturnIsBackfill: z.boolean().optional().default(false),
  reason: z.string().trim().min(1).max(1_000),
});

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.grn.match_ssr");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select a PR, an SSR, and enter a reason" }, { status: 400 });

  const input = parsed.data;
  const [purchaseReceipt, stockReturn] = await Promise.all([
    input.purchaseReceiptIsBackfill
      ? prisma.grnBackfillPurchaseReceipt.findUnique({ where: { companyId_name: { companyId, name: input.purchaseReceiptName } }, select: { id: true, docstatus: true, deletedAt: true } })
      : prisma.grnPurchaseReceipt.findUnique({ where: { companyId_name: { companyId, name: input.purchaseReceiptName } }, select: { id: true, docstatus: true, deletedAt: true } }),
    input.supplierStockReturnIsBackfill
      ? prisma.grnBackfillSupplierStockReturn.findUnique({ where: { companyId_name: { companyId, name: input.supplierStockReturnName } }, select: { id: true, docstatus: true, deletedAt: true } })
      : prisma.grnSupplierStockReturn.findUnique({ where: { companyId_name: { companyId, name: input.supplierStockReturnName } }, select: { id: true, docstatus: true, deletedAt: true } }),
  ]);
  if (!purchaseReceipt || !stockReturn) return NextResponse.json({ error: "Purchase receipt or supplier stock return not found" }, { status: 404 });
  if (purchaseReceipt.docstatus === 2 || stockReturn.docstatus === 2 || purchaseReceipt.deletedAt || stockReturn.deletedAt) {
    return NextResponse.json({ error: "Cancelled or deleted records cannot be specially linked" }, { status: 400 });
  }

  const createdByName = context?.user?.name?.trim() || context?.user?.email?.trim() || null;
  await prisma.$transaction(async (tx) => {
    await tx.grnSpecialLink.upsert({
      where: {
        companyId_supplierStockReturnName_supplierStockReturnIsBackfill_purchaseReceiptName_purchaseReceiptIsBackfill: {
          companyId,
          supplierStockReturnName: input.supplierStockReturnName,
          supplierStockReturnIsBackfill: input.supplierStockReturnIsBackfill,
          purchaseReceiptName: input.purchaseReceiptName,
          purchaseReceiptIsBackfill: input.purchaseReceiptIsBackfill,
        },
      },
      create: { companyId, ...input, createdByName },
      update: { reason: input.reason, createdByName },
    });
    if (input.supplierStockReturnIsBackfill) {
      await tx.grnBackfillSupplierStockReturn.updateMany({ where: { id: stockReturn.id, purchaseReceiptName: null }, data: { purchaseReceiptName: input.purchaseReceiptName } });
    } else {
      await tx.grnSupplierStockReturn.updateMany({ where: { id: stockReturn.id, purchaseReceiptName: null }, data: { purchaseReceiptName: input.purchaseReceiptName } });
    }
    if (!input.purchaseReceiptIsBackfill) {
      await tx.grnPurchaseReceipt.updateMany({ where: { id: purchaseReceipt.id, supplierStockReturnName: null }, data: { supplierStockReturnName: input.supplierStockReturnName } });
    }
    if (!input.purchaseReceiptIsBackfill && !input.supplierStockReturnIsBackfill) {
      await tx.grnSupplierStockReturnPurchaseReceipt.upsert({
        where: { supplierStockReturnId_purchaseReceiptId: { supplierStockReturnId: stockReturn.id, purchaseReceiptId: purchaseReceipt.id } },
        create: { companyId, supplierStockReturnId: stockReturn.id, purchaseReceiptId: purchaseReceipt.id }, update: {},
      });
      await attachPendingSupplierStockReturnPurchaseInvoices(tx, { companyId, stockReturnName: input.supplierStockReturnName, purchaseReceiptId: purchaseReceipt.id, purchaseReceiptName: input.purchaseReceiptName });
    }
    if (input.purchaseReceiptIsBackfill && input.supplierStockReturnIsBackfill) {
      await tx.grnBackfillSupplierStockReturnPurchaseReceipt.upsert({
        where: { supplierStockReturnId_purchaseReceiptId: { supplierStockReturnId: stockReturn.id, purchaseReceiptId: purchaseReceipt.id } },
        create: { companyId, supplierStockReturnId: stockReturn.id, purchaseReceiptId: purchaseReceipt.id }, update: {},
      });
    }
  });
  return NextResponse.json({ ok: true });
}
