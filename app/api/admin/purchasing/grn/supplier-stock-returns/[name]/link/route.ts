import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildGrnCompanyResolver } from "@/lib/grn-company-resolver";
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

function companyFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const top = rawPayload as Record<string, unknown>;
  const payload =
    top.data && typeof top.data === "object" && !Array.isArray(top.data)
      ? (top.data as Record<string, unknown>)
      : top;
  return typeof payload.company === "string" && payload.company.trim()
    ? payload.company.trim()
    : null;
}

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
    select: {
      id: true,
      docstatus: true,
      purchaseReceiptName: true,
      supplier: true,
      supplierName: true,
      rawPayload: true,
    },
  });
  const backfillStockReturn = stockReturn
    ? null
    : await prisma.grnBackfillSupplierStockReturn.findUnique({
        where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
        select: {
          id: true,
          docstatus: true,
          purchaseReceiptName: true,
          supplier: true,
          supplierName: true,
          rawPayload: true,
        },
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
  let purchaseReceiptMatchData: {
    companyLocationId: string | null;
    supplier: string;
    supplierName: string | null;
  } | null = null;
  if (purchaseReceiptName) {
    const pr = await prisma.grnPurchaseReceipt.findUnique({
      where: { companyId_name: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName } },
      select: {
        id: true,
        name: true,
        docstatus: true,
        companyLocationId: true,
        supplier: true,
        supplierName: true,
      },
    });
    const backfillPr = pr
      ? null
      : await prisma.grnBackfillPurchaseReceipt.findUnique({
          where: { companyId_name: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName } },
          select: {
            id: true,
            name: true,
            docstatus: true,
            companyLocationId: true,
            supplier: true,
            supplierName: true,
          },
        });
    if (!pr && !backfillPr) {
      return NextResponse.json({ error: "Purchase receipt not found" }, { status: 404 });
    }
    if ((pr?.docstatus ?? backfillPr?.docstatus) === 2) {
      return NextResponse.json({ error: "Cancelled purchase receipts cannot be linked" }, { status: 400 });
    }
    purchaseReceiptId = pr?.id ?? backfillPr?.id ?? null;
    purchaseReceiptIsBackfill = !pr && Boolean(backfillPr);
    purchaseReceiptMatchData = pr ?? backfillPr;
  }

  if (purchaseReceiptName && purchaseReceiptMatchData && mode !== "remove") {
    const locations = await prisma.companyLocation.findMany({
      where: { companyId: targetCompanyId },
      select: {
        id: true,
        name: true,
        shortName: true,
        erpnextCompany: true,
        supplierPrefix: true,
        isMainCompany: true,
      },
    });
    const resolver = buildGrnCompanyResolver(locations);
    const selectedStockReturn = stockReturn ?? backfillStockReturn!;
    const isMatchingPair = resolver.isMatchingIntercompanyPair({
      purchaseReceiptCompanyLocationId: purchaseReceiptMatchData.companyLocationId,
      purchaseReceiptSupplier: purchaseReceiptMatchData.supplier,
      purchaseReceiptSupplierName: purchaseReceiptMatchData.supplierName,
      stockReturnName,
      stockReturnCompany: companyFromRawPayload(selectedStockReturn.rawPayload),
      stockReturnSupplier: selectedStockReturn.supplier,
      stockReturnSupplierName: selectedStockReturn.supplierName,
    });
    if (!isMatchingPair) {
      return NextResponse.json(
        { error: "The PR and SSR belong to different intercompany supplier flows" },
        { status: 400 },
      );
    }
  }

  if (mode === "append" || mode === "remove") {
    if (!purchaseReceiptName || !purchaseReceiptId) {
      return NextResponse.json({ error: "A purchase receipt is required" }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      if (stockReturnIsBackfill !== purchaseReceiptIsBackfill) {
        if (mode === "append") {
          if (stockReturnIsBackfill) {
            await tx.grnBackfillSupplierStockReturn.updateMany({
              where: { companyId: targetCompanyId, name: stockReturnName, purchaseReceiptName: null },
              data: { purchaseReceiptName },
            });
          } else {
            await tx.grnSupplierStockReturn.updateMany({
              where: { companyId: targetCompanyId, name: stockReturnName, purchaseReceiptName: null },
              data: { purchaseReceiptName },
            });
          }
          if (!purchaseReceiptIsBackfill) {
            await tx.grnPurchaseReceipt.updateMany({
              where: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName, supplierStockReturnName: null },
              data: { supplierStockReturnName: stockReturnName },
            });
          }
        } else {
          if (stockReturnIsBackfill) {
            await tx.grnBackfillSupplierStockReturn.updateMany({
              where: { companyId: targetCompanyId, name: stockReturnName, purchaseReceiptName },
              data: { purchaseReceiptName: null },
            });
          } else {
            await tx.grnSupplierStockReturn.updateMany({
              where: { companyId: targetCompanyId, name: stockReturnName, purchaseReceiptName },
              data: { purchaseReceiptName: null },
            });
          }
          if (!purchaseReceiptIsBackfill) {
            await tx.grnPurchaseReceipt.updateMany({
              where: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName, supplierStockReturnName: stockReturnName },
              data: { supplierStockReturnName: null },
            });
          }
        }
      } else if (purchaseReceiptIsBackfill) {
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
          await tx.grnPurchaseReceipt.updateMany({
            where: { id: purchaseReceiptId, supplierStockReturnName: null },
            data: { supplierStockReturnName: stockReturnName },
          });
        } else {
          await tx.grnSupplierStockReturnPurchaseReceipt.deleteMany({
            where: { supplierStockReturnId: stockReturn!.id, purchaseReceiptId },
          });
          const remaining = await tx.grnSupplierStockReturnPurchaseReceipt.findFirst({
            where: { supplierStockReturnId: stockReturn!.id },
            orderBy: { createdAt: "asc" },
            select: { purchaseReceipt: { select: { name: true } } },
          });
          const remainingForPurchaseReceipt = await tx.grnSupplierStockReturnPurchaseReceipt.findFirst({
            where: { purchaseReceiptId },
            orderBy: { createdAt: "asc" },
            select: { supplierStockReturn: { select: { name: true } } },
          });
          const currentPurchaseReceipt = await tx.grnPurchaseReceipt.findUnique({
            where: { id: purchaseReceiptId },
            select: { supplierStockReturnName: true },
          });
          await tx.grnPurchaseReceipt.update({
            where: { id: purchaseReceiptId },
            data: {
              supplierStockReturnName:
                remainingForPurchaseReceipt?.supplierStockReturn.name ??
                (currentPurchaseReceipt?.supplierStockReturnName !== stockReturnName
                  ? currentPurchaseReceipt?.supplierStockReturnName
                  : null),
            },
          });
          await tx.grnSupplierStockReturn.update({
            where: { companyId_name: { companyId: targetCompanyId, name: stockReturnName } },
            data: { purchaseReceiptName: remaining?.purchaseReceipt.name ?? null },
          });
        }
      }

      if (mode === "append") {
        if (purchaseReceiptId && !purchaseReceiptIsBackfill) {
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
    if (!purchaseReceiptIsBackfill && purchaseReceiptName) {
      await tx.grnPurchaseReceipt.updateMany({
        where: { companyId: purchaseReceiptCompanyId, name: purchaseReceiptName },
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
      if (!purchaseReceiptIsBackfill && purchaseReceiptName) {
        await tx.grnPurchaseReceipt.updateMany({
          where: {
            companyId: purchaseReceiptCompanyId,
            name: purchaseReceiptName,
            supplierStockReturnName: stockReturnName,
          },
          data: { supplierStockReturnName: null },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}

