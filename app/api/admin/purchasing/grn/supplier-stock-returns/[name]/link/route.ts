import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { attachPendingSupplierStockReturnPurchaseInvoices } from "@/lib/grn";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  purchaseReceiptName: z.string().min(1).nullable(),
  mode: z.enum(["replace", "append", "remove"]).optional().default("replace"),
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
  const mode = parsed.data.mode;
  const targetCompanyId = parsed.data.companyId ?? companyId;
  const purchaseReceiptCompanyId = parsed.data.purchaseReceiptCompanyId ?? targetCompanyId;

  const stockReturn = await prisma.grnSupplierStockReturn.findUnique({
    where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
    select: { id: true, docstatus: true, purchaseReceiptName: true },
  });
  const backfillStockReturn = stockReturn
    ? null
    : await prisma.grnBackfillSupplierStockReturn.findUnique({
        where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
        select: { id: true, docstatus: true, purchaseReceiptName: true },
      });
  if (!stockReturn && !backfillStockReturn) {
    return NextResponse.json({ error: "Supplier stock return not found" }, { status: 404 });
  }
  if (purchaseReceiptName && (stockReturn?.docstatus ?? backfillStockReturn?.docstatus) === 2) {
    return NextResponse.json({ error: "Cancelled supplier stock returns cannot be linked" }, { status: 400 });
  }
  const stockReturnIsBackfill = !stockReturn && Boolean(backfillStockReturn);

  let purchaseReceiptId: string | null = null;
  let purchaseReceiptIsBackfill = false;
  if (purchaseReceiptName) {
    const pr = await prisma.grnPurchaseReceipt.findUnique({
      where: { companyId_name: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName } },
      select: { id: true, name: true, docstatus: true },
    });
    const backfillPr = pr
      ? null
      : await prisma.grnBackfillPurchaseReceipt.findUnique({
          where: { companyId_name: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName } },
          select: { id: true, name: true, docstatus: true },
        });
    if (!pr && !backfillPr) {
      return NextResponse.json({ error: "Purchase receipt not found" }, { status: 404 });
    }
    if ((pr?.docstatus ?? backfillPr?.docstatus) === 2) {
      return NextResponse.json({ error: "Cancelled purchase receipts cannot be linked" }, { status: 400 });
    }
    purchaseReceiptId = pr?.id ?? null;
    purchaseReceiptIsBackfill = !pr && Boolean(backfillPr);
  }

  if (mode === "append" || mode === "remove") {
    if (!purchaseReceiptName || !purchaseReceiptId) {
      return NextResponse.json({ error: "A purchase receipt is required" }, { status: 400 });
    }
    if (stockReturnIsBackfill !== purchaseReceiptIsBackfill) {
      return NextResponse.json({ error: "Live and backfill records cannot share a multi-PR link" }, { status: 400 });
    }

    const linkedNames = purchaseReceiptIsBackfill
      ? (await prisma.grnBackfillSupplierStockReturnPurchaseReceipt.findMany({
          where: { purchaseReceiptId },
          select: { supplierStockReturn: { select: { name: true } } },
        })).map((link) => link.supplierStockReturn.name)
      : (await prisma.grnSupplierStockReturnPurchaseReceipt.findMany({
          where: { purchaseReceiptId },
          select: { supplierStockReturn: { select: { name: true } } },
        })).map((link) => link.supplierStockReturn.name);
    if (!purchaseReceiptIsBackfill) {
      const livePr = await prisma.grnPurchaseReceipt.findUnique({
        where: { id: purchaseReceiptId },
        select: { supplierStockReturnName: true },
      });
      if (livePr?.supplierStockReturnName) linkedNames.push(livePr.supplierStockReturnName);
    }
    if (mode === "append" && linkedNames.some((linkedName) => linkedName !== stockReturnName)) {
      return NextResponse.json({ error: "This purchase receipt is already linked to another SSR" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      if (purchaseReceiptIsBackfill) {
        if (mode === "append") {
          await tx.grnBackfillSupplierStockReturnPurchaseReceipt.upsert({
            where: {
              supplierStockReturnId_purchaseReceiptId: {
                supplierStockReturnId: backfillStockReturn!.id,
                purchaseReceiptId,
              },
            },
            create: {
              companyId: targetCompanyId,
              supplierStockReturnId: backfillStockReturn!.id,
              purchaseReceiptId,
            },
            update: {},
          });
          await tx.grnBackfillSupplierStockReturn.update({
            where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
            data: { purchaseReceiptName: stockReturn?.purchaseReceiptName ?? purchaseReceiptName },
          });
        } else {
          await tx.grnBackfillSupplierStockReturnPurchaseReceipt.deleteMany({
            where: { supplierStockReturnId: backfillStockReturn!.id, purchaseReceiptId },
          });
          const remaining = await tx.grnBackfillSupplierStockReturnPurchaseReceipt.findFirst({
            where: { supplierStockReturnId: backfillStockReturn!.id },
            orderBy: { createdAt: "asc" },
            select: { purchaseReceipt: { select: { name: true } } },
          });
          await tx.grnBackfillSupplierStockReturn.update({
            where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
            data: { purchaseReceiptName: remaining?.purchaseReceipt.name ?? null },
          });
        }
      } else {
        if (mode === "append") {
          await tx.grnSupplierStockReturnPurchaseReceipt.upsert({
            where: {
              supplierStockReturnId_purchaseReceiptId: {
                supplierStockReturnId: stockReturn!.id,
                purchaseReceiptId,
              },
            },
            create: {
              companyId: targetCompanyId,
              supplierStockReturnId: stockReturn!.id,
              purchaseReceiptId,
            },
            update: {},
          });
          await tx.grnSupplierStockReturn.update({
            where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
            data: { purchaseReceiptName: stockReturn?.purchaseReceiptName ?? purchaseReceiptName },
          });
          await tx.grnPurchaseReceipt.update({
            where: { id: purchaseReceiptId },
            data: { supplierStockReturnName: stockReturnName },
          });
        } else {
          await tx.grnSupplierStockReturnPurchaseReceipt.deleteMany({
            where: { supplierStockReturnId: stockReturn!.id, purchaseReceiptId },
          });
          await tx.grnPurchaseReceipt.updateMany({
            where: { id: purchaseReceiptId, supplierStockReturnName: stockReturnName },
            data: { supplierStockReturnName: null },
          });
          const remaining = await tx.grnSupplierStockReturnPurchaseReceipt.findFirst({
            where: { supplierStockReturnId: stockReturn!.id },
            orderBy: { createdAt: "asc" },
            select: { purchaseReceipt: { select: { name: true } } },
          });
          await tx.grnSupplierStockReturn.update({
            where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
            data: { purchaseReceiptName: remaining?.purchaseReceipt.name ?? null },
          });
        }
      }

      if (mode === "append") {
        if (purchaseReceiptId) {
          await attachPendingSupplierStockReturnPurchaseInvoices(tx, {
            companyId: targetCompanyId,
            stockReturnName,
            purchaseReceiptId,
            purchaseReceiptName,
          });
        }
        await tx.grnBackfillPurchaseInvoice.updateMany({
          where: {
            companyId: targetCompanyId,
            docstatus: { not: 2 },
            OR: [
              { billNo: `SSR-${stockReturnName}` },
              { supplierStockReturnName: stockReturnName },
              { items: { some: { supplierStockReturn: stockReturnName } } },
            ],
          },
          data: { purchaseReceiptName, supplierStockReturnName: stockReturnName },
        });
      }
    });

    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction(async (tx) => {
    const displacedStockReturns = purchaseReceiptName
      ? await tx.grnSupplierStockReturn.findMany({
          where: {
            purchaseReceiptName,
            name: { not: stockReturnName },
            docstatus: { not: 2 },
          },
        select: { id: true, name: true },
        })
      : [];
    const displacedBackfillStockReturns = purchaseReceiptName
      ? await tx.grnBackfillSupplierStockReturn.findMany({
          where: {
            purchaseReceiptName,
            name: { not: stockReturnName },
            docstatus: { not: 2 },
          },
        select: { id: true, name: true },
        })
      : [];

    await tx.grnPurchaseReceipt.updateMany({
      where: { supplierStockReturnName: stockReturnName },
      data: { supplierStockReturnName: null },
    });
    if (purchaseReceiptName) {
      await tx.grnSupplierStockReturn.updateMany({
        where: {
          purchaseReceiptName,
          name: { not: stockReturnName },
          docstatus: { not: 2 },
        },
        data: { purchaseReceiptName: null },
      });
      await tx.grnBackfillSupplierStockReturn.updateMany({
        where: {
          purchaseReceiptName,
          name: { not: stockReturnName },
          docstatus: { not: 2 },
        },
        data: { purchaseReceiptName: null },
      });
      for (const displaced of displacedStockReturns) {
        await tx.grnPurchaseInvoice.updateMany({
          where: {
            docstatus: { not: 2 },
            OR: [
              { billNo: `SSR-${displaced.name}` },
              { items: { some: { supplierStockReturn: displaced.name } } },
            ],
          },
          data: {
            purchaseReceiptId: null,
            purchaseReceiptName: null,
          },
        });
        await tx.grnSupplierStockReturnPurchaseReceipt.deleteMany({ where: { supplierStockReturnId: displaced.id, purchaseReceiptId: purchaseReceiptId ?? "__none__" } });
      }
      for (const displaced of displacedBackfillStockReturns) {
        await tx.grnBackfillPurchaseInvoice.updateMany({
          where: {
            docstatus: { not: 2 },
            OR: [
              { billNo: `SSR-${displaced.name}` },
              { supplierStockReturnName: displaced.name },
              { items: { some: { supplierStockReturn: displaced.name } } },
            ],
          },
          data: {
            purchaseReceiptName: null,
            supplierStockReturnName: null,
          },
        });
        await tx.grnBackfillSupplierStockReturnPurchaseReceipt.deleteMany({ where: { supplierStockReturnId: displaced.id, purchaseReceiptId: purchaseReceiptId ?? "__none__" } });
      }
    }
    if (!purchaseReceiptIsBackfill) {
      await tx.grnPurchaseReceipt.updateMany({
        where: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName ?? "__none__" },
        data: { supplierStockReturnName: stockReturnName },
      });
    }
    if (stockReturnIsBackfill) {
      await tx.grnBackfillSupplierStockReturn.update({
        where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
        data: { purchaseReceiptName },
      });
    } else {
      await tx.grnSupplierStockReturn.update({
        where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
        data: { purchaseReceiptName },
      });
    }
    if (purchaseReceiptName) {
      if (stockReturnIsBackfill) {
        await tx.grnBackfillSupplierStockReturnPurchaseReceipt.deleteMany({
          where: { supplierStockReturnId: backfillStockReturn!.id },
        });
      } else {
        await tx.grnSupplierStockReturnPurchaseReceipt.deleteMany({
          where: { supplierStockReturnId: stockReturn!.id },
        });
      }
    }
    if (purchaseReceiptName && purchaseReceiptId && stockReturnIsBackfill === purchaseReceiptIsBackfill) {
      if (purchaseReceiptIsBackfill) {
        await tx.grnBackfillSupplierStockReturnPurchaseReceipt.upsert({
          where: { supplierStockReturnId_purchaseReceiptId: { supplierStockReturnId: backfillStockReturn!.id, purchaseReceiptId } },
          create: { companyId: targetCompanyId, supplierStockReturnId: backfillStockReturn!.id, purchaseReceiptId },
          update: {},
        });
      } else {
        await tx.grnSupplierStockReturnPurchaseReceipt.upsert({
          where: { supplierStockReturnId_purchaseReceiptId: { supplierStockReturnId: stockReturn!.id, purchaseReceiptId } },
          create: { companyId: targetCompanyId, supplierStockReturnId: stockReturn!.id, purchaseReceiptId },
          update: {},
        });
      }
    } else if (!purchaseReceiptName) {
      if (stockReturnIsBackfill) {
        await tx.grnBackfillSupplierStockReturnPurchaseReceipt.deleteMany({ where: { supplierStockReturnId: backfillStockReturn!.id } });
      } else {
        await tx.grnSupplierStockReturnPurchaseReceipt.deleteMany({ where: { supplierStockReturnId: stockReturn!.id } });
      }
    }
    if (purchaseReceiptName && purchaseReceiptId) {
      await attachPendingSupplierStockReturnPurchaseInvoices(tx, {
        companyId: targetCompanyId,
        stockReturnName,
        purchaseReceiptId,
        purchaseReceiptName,
      });
    }
    if (purchaseReceiptName) {
      await tx.grnBackfillPurchaseInvoice.updateMany({
        where: {
          companyId: targetCompanyId,
          docstatus: { not: 2 },
          OR: [
            { billNo: `SSR-${stockReturnName}` },
            { supplierStockReturnName: stockReturnName },
            { items: { some: { supplierStockReturn: stockReturnName } } },
          ],
        },
        data: {
          purchaseReceiptName,
          supplierStockReturnName: stockReturnName,
        },
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
      await tx.grnBackfillPurchaseInvoice.updateMany({
        where: {
          docstatus: { not: 2 },
          OR: [
            { billNo: `SSR-${stockReturnName}` },
            { supplierStockReturnName: stockReturnName },
            { items: { some: { supplierStockReturn: stockReturnName } } },
          ],
        },
        data: {
          purchaseReceiptName: null,
          supplierStockReturnName: null,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}

