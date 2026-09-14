import { NextRequest, NextResponse } from "next/server";

import { tallyLinkedItems } from "@/lib/grn";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.grn.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const from = parseDateParam(request.nextUrl.searchParams.get("from"));
  const to = parseDateParam(request.nextUrl.searchParams.get("to"), true);
  const dateFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;

  const [purchaseReceipts, stockReturns] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: {
        companyId,
        ...(dateFilter
          ? {
              OR: [
                { creation: dateFilter },
                { creation: null, postingDate: dateFilter },
              ],
            }
          : {}),
      },
      orderBy: [{ creation: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { items: true },
    }),
    prisma.grnSupplierStockReturn.findMany({
      where: {
        companyId,
        ...(dateFilter
          ? {
              OR: [
                { returnDate: dateFilter },
                { returnDate: null, creation: dateFilter },
              ],
            }
          : {}),
      },
      orderBy: [{ creation: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { items: true },
    }),
  ]);

  const stockReturnByName = new Map(stockReturns.map((row) => [row.name, row]));
  const activePurchaseReceiptNames = new Set(
    purchaseReceipts.filter((row) => row.docstatus !== 2).map((row) => row.name),
  );

  return NextResponse.json({
    purchaseReceipts: purchaseReceipts.map((row) => {
      const linked = row.supplierStockReturnName
        ? stockReturnByName.get(row.supplierStockReturnName)
        : null;
      const activeLinked = row.docstatus !== 2 && linked?.docstatus !== 2 ? linked : null;
      const tally = activeLinked
        ? tallyLinkedItems(row.items, activeLinked.items)
        : { status: "not_linked" as const, issueItems: [] };
      return {
        name: row.name,
        adjustmentNo: row.supplierStockReturnName,
        amendedFrom: row.amendedFrom,
        grnDate: iso(row.creation ?? row.postingDate),
        grnBy: row.owner,
        supplier: row.supplier,
        supplierName: row.supplierName,
        handoverAt: iso(row.handoverAt),
        valuedAt: iso(row.valuedAt),
        receivedAt: iso(row.receivedAt),
        status: row.status,
        docstatus: row.docstatus,
        itemCount: row.items.length,
        tallyStatus: tally.status,
        tallyIssueItems: tally.issueItems,
      };
    }),
    supplierStockReturns: stockReturns.map((row) => ({
      name: row.name,
      supplier: row.supplier,
      returnDate: iso(row.returnDate),
      docstatus: row.docstatus,
      owner: row.owner,
      creation: iso(row.creation),
      amendedFrom: row.amendedFrom,
      purchaseReceiptName: row.purchaseReceiptName,
      canTally: row.docstatus !== 2 && (!row.purchaseReceiptName || activePurchaseReceiptNames.has(row.purchaseReceiptName)),
      itemCount: row.items.length,
    })),
  });
}
