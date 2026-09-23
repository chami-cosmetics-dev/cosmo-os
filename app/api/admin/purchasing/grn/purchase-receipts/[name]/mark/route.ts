import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { tallySsrPurchaseInvoicePrices } from "@/lib/grn";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  field: z.enum(["handoverAt", "valuedAt", "receivedAt"]),
  companyId: z.string().min(1).optional(),
});

const FIELD_PERMISSIONS: Record<z.infer<typeof schema>["field"], string> = {
  handoverAt: "purchasing.grn.mark_handover",
  valuedAt: "purchasing.grn.mark_valued",
  receivedAt: "purchasing.grn.mark_received",
};

const FIELD_ACTOR_COLUMNS: Record<z.infer<typeof schema>["field"], string> = {
  handoverAt: "handoverById",
  valuedAt: "valuedById",
  receivedAt: "receivedById",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const auth = await requirePermission(FIELD_PERMISSIONS[parsed.data.field]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const user = context?.user;
  const companyId = user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const targetCompanyId = parsed.data.companyId ?? companyId;

  const row = await prisma.grnPurchaseReceipt.findUnique({
    where: { companyId_name: { companyId: targetCompanyId, name: decodedName } },
    select: {
      id: true,
      docstatus: true,
      handoverAt: true,
      valuedAt: true,
      supplierStockReturnName: true,
      purchaseInvoices: {
        where: { docstatus: { not: 2 } },
        orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
        take: 1,
        include: { items: true },
      },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Purchase receipt not found" }, { status: 404 });
  }
  if (row.docstatus === 2) {
    return NextResponse.json({ error: "Cancelled purchase receipts cannot be marked" }, { status: 409 });
  }
  if (parsed.data.field === "valuedAt" && !row.handoverAt) {
    return NextResponse.json({ error: "Mark handover before marking valued" }, { status: 409 });
  }
  if (parsed.data.field === "receivedAt" && (!row.handoverAt || !row.valuedAt)) {
    return NextResponse.json({ error: "Mark handover and valued before marking GRN received" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.grnPurchaseReceipt.update({
      where: { companyId_name: { companyId: targetCompanyId, name: decodedName } },
      data: {
        [parsed.data.field]: new Date(),
        [FIELD_ACTOR_COLUMNS[parsed.data.field]]: user.id,
      },
    });

    if (parsed.data.field !== "handoverAt" || row.valuedAt) return;

    const purchaseInvoice = row.purchaseInvoices[0] ?? null;
    if (!purchaseInvoice) return;

    if (!row.supplierStockReturnName) {
      await tx.grnPurchaseReceipt.update({
        where: { id: row.id },
        data: { valuedAt: new Date(), valuedById: null },
      });
      return;
    }

    const stockReturn = await tx.grnSupplierStockReturn.findFirst({
      where: {
        name: row.supplierStockReturnName,
        docstatus: { not: 2 },
      },
      include: { items: true },
    });
    if (!stockReturn) return;

    const priceTally = tallySsrPurchaseInvoicePrices(stockReturn.items, purchaseInvoice.items);
    if (priceTally.status !== "matched") return;

    await tx.grnPurchaseReceipt.update({
      where: { id: row.id },
      data: { valuedAt: new Date(), valuedById: null },
    });
  });

  return NextResponse.json({ ok: true });
}




