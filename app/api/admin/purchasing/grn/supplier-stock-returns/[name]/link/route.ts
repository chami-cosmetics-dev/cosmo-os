import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { attachPendingSupplierStockReturnPurchaseInvoices } from "@/lib/grn";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  purchaseReceiptName: z.string().min(1).nullable(),
  companyId: z.string().min(1).optional(),
  purchaseReceiptCompanyId: z.string().min(1).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const auth = await requirePermission("purchasing.grn.match_ssr");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { name } = await params;
  const stockReturnName = decodeURIComponent(name);
  const purchaseReceiptName = parsed.data.purchaseReceiptName;
  const targetCompanyId = parsed.data.companyId ?? companyId;
  const purchaseReceiptCompanyId = parsed.data.purchaseReceiptCompanyId ?? targetCompanyId;

  const stockReturn = await prisma.grnSupplierStockReturn.findUnique({
    where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
    select: { docstatus: true },
  });
  if (!stockReturn) {
    return NextResponse.json({ error: "Supplier stock return not found" }, { status: 404 });
  }
  if (purchaseReceiptName && stockReturn.docstatus === 2) {
    return NextResponse.json({ error: "Cancelled supplier stock returns cannot be linked" }, { status: 400 });
  }

  let purchaseReceiptId: string | null = null;
  if (purchaseReceiptName) {
    const pr = await prisma.grnPurchaseReceipt.findUnique({
      where: { companyId_name: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName } },
      select: { id: true, name: true, docstatus: true },
    });
    if (!pr) {
      return NextResponse.json({ error: "Purchase receipt not found" }, { status: 404 });
    }
    if (pr.docstatus === 2) {
      return NextResponse.json({ error: "Cancelled purchase receipts cannot be linked" }, { status: 400 });
    }
    purchaseReceiptId = pr.id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.grnPurchaseReceipt.updateMany({
      where: { supplierStockReturnName: stockReturnName },
      data: { supplierStockReturnName: null },
    });
    await tx.grnPurchaseReceipt.updateMany({
      where: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName ?? "__none__" },
      data: { supplierStockReturnName: stockReturnName },
    });
    await tx.grnSupplierStockReturn.update({
      where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
      data: { purchaseReceiptName },
    });
    if (purchaseReceiptName && purchaseReceiptId) {
      await attachPendingSupplierStockReturnPurchaseInvoices(tx, {
        stockReturnName,
        purchaseReceiptId,
        purchaseReceiptName,
      });
    } else {
      await tx.grnPurchaseInvoice.updateMany({
        where: {
          docstatus: { not: 2 },
          OR: [
            { billNo: `SSR-${stockReturnName}` },
            { items: { some: { supplierStockReturn: stockReturnName } } },
          ],
        },
        data: {
          purchaseReceiptId: null,
          purchaseReceiptName: null,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}


