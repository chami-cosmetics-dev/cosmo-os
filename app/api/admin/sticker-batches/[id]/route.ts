import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

function isStickerBatchPrismaReady() {
  const client = prisma as unknown as Record<string, unknown>;
  return Boolean(client.stickerBatch && client.stickerBatchItem);
}

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isStickerBatchPrismaReady()) {
    return NextResponse.json(
      { error: "Sticker Batch Prisma client is not ready." },
      { status: 503 }
    );
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const { id } = await params;
  const batch = await (prisma as unknown as {
    stickerBatch: {
      findFirst: (args: {
        where: { id: string; companyId: string };
        select: {
          id: true;
          batchName: true;
          batchDate: true;
          remark: true;
          supplier: { select: { name: true } };
        };
      }) => Promise<{
        id: string;
        batchName: string;
        batchDate: Date;
        remark: string | null;
        supplier: { name: string };
      } | null>;
    };
  }).stickerBatch.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      batchName: true,
      batchDate: true,
      remark: true,
      supplier: { select: { name: true } },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Sticker batch not found" }, { status: 404 });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, address: true },
  });

  const items = await (prisma as unknown as {
    stickerBatchItem: {
      findMany: (args: {
        where: { stickerBatchId: string; companyId: string };
        orderBy: { createdAt: "asc" };
        select: {
          id: true;
          itemCode: true;
          itemName: true;
          unitPrice: true;
          quantity: true;
          manufactureDate: true;
          expireDate: true;
          companyLocation: {
            select: {
              locationReference: true;
              address: true;
              invoicePhone: true;
              name: true;
            };
          };
        };
      }) => Promise<Array<{
        id: string;
        itemCode: string;
        itemName: string;
        unitPrice: { toString(): string };
        quantity: number;
        manufactureDate: Date;
        expireDate: Date;
        companyLocation: {
          locationReference: string | null;
          address: string | null;
          invoicePhone: string | null;
          name: string;
        };
      }>>;
    };
  }).stickerBatchItem.findMany({
    where: { stickerBatchId: batch.id, companyId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      itemCode: true,
      itemName: true,
      unitPrice: true,
      quantity: true,
      manufactureDate: true,
      expireDate: true,
      companyLocation: {
        select: {
          locationReference: true,
          address: true,
          invoicePhone: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({
    id: batch.id,
    batchName: batch.batchName,
    batchDate: batch.batchDate,
    remark: batch.remark,
    supplierName: batch.supplier.name,
    companyName: company?.name ?? "",
    companyAddress: company?.address ?? "",
    items: items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      unitPrice: item.unitPrice.toString(),
      quantity: item.quantity,
      manufactureDate: item.manufactureDate,
      expireDate: item.expireDate,
      locationReference: item.companyLocation.locationReference,
      locationName: item.companyLocation.name,
      locationAddress: item.companyLocation.address,
      locationPhone: item.companyLocation.invoicePhone,
    })),
  });
}
