import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission, requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

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

const updateStickerBatchSchema = z.object({
  printCosmeticsLogo: z.boolean(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAnyPermission(["stickers.batch.read", "stickers.print.read"]);
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
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid sticker batch id" }, { status: 400 });
  }

  const batch = await (prisma as unknown as {
    stickerBatch: {
      findFirst: (args: {
        where: { id: string; companyId: string };
        select: {
          id: true;
          batchName: true;
          batchDate: true;
          remark: true;
          printCosmeticsLogo: true;
          supplier: { select: { name: true; code: true } };
        };
      }) => Promise<{
        id: string;
        batchName: string;
        batchDate: Date;
        remark: string | null;
        printCosmeticsLogo: boolean;
        supplier: { name: string; code: string };
      } | null>;
    };
  }).stickerBatch.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      batchName: true,
      batchDate: true,
      remark: true,
      printCosmeticsLogo: true,
      supplier: { select: { name: true, code: true } },
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
              id: true;
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
        manufactureDate: Date | null;
        expireDate: Date | null;
        companyLocation: {
          locationReference: string | null;
          id: string;
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
          id: true,
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
    printCosmeticsLogo: batch.printCosmeticsLogo,
    supplierName: batch.supplier.name,
    supplierCode: batch.supplier.code,
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
      locationId: item.companyLocation.id,
      locationReference: item.companyLocation.locationReference,
      locationName: item.companyLocation.name,
      locationAddress: item.companyLocation.address,
      locationPhone: item.companyLocation.invoicePhone,
    })),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("stickers.batch.manage");
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
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid sticker batch id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateStickerBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const updated = await (prisma as unknown as {
      stickerBatch: {
        updateMany: (args: {
          where: { id: string; companyId: string };
          data: { printCosmeticsLogo: boolean };
        }) => Promise<{ count: number }>;
        findFirst: (args: {
          where: { id: string; companyId: string };
          select: { id: true; printCosmeticsLogo: true };
        }) => Promise<{ id: string; printCosmeticsLogo: boolean } | null>;
      };
    }).stickerBatch.updateMany({
      where: { id, companyId },
      data: { printCosmeticsLogo: parsed.data.printCosmeticsLogo },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Sticker batch not found" }, { status: 404 });
    }

    return NextResponse.json({
      id,
      printCosmeticsLogo: parsed.data.printCosmeticsLogo,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to update sticker batch" },
      { status: 500 }
    );
  }
}
