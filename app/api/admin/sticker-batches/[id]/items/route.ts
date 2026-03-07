import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const dateStringSchema = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/);

const saveItemsSchema = z.object({
  locationId: z.string().min(1),
  items: z
    .array(
      z.object({
        itemCode: z.string().trim().min(1).max(120),
        itemName: z.string().trim().min(1).max(500),
        unitPrice: z.string().trim().regex(/^\d+(\.\d{1,2})?$/),
        quantity: z.number().int().positive().max(100000),
        manufactureDate: dateStringSchema,
        expireDate: dateStringSchema,
      })
    )
    .min(1),
});

function parseDDMMYYYY(value: string): Date | null {
  const [dd, mm, yyyy] = value.split("/");
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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

  const { id: batchId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = saveItemsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const batch = await (prisma as unknown as {
    stickerBatch: {
      findFirst: (args: {
        where: { id: string; companyId: string };
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };
  }).stickerBatch.findFirst({
    where: { id: batchId, companyId },
    select: { id: true },
  });
  if (!batch) {
    return NextResponse.json({ error: "Sticker batch not found" }, { status: 404 });
  }

  const location = await prisma.companyLocation.findFirst({
    where: { id: parsed.data.locationId, companyId },
    select: { id: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const items: Array<{
    itemCode: string;
    itemName: string;
    unitPrice: string;
    quantity: number;
    manufactureDate: Date;
    expireDate: Date;
  }> = [];

  for (const item of parsed.data.items) {
    const manufactureDate = parseDDMMYYYY(item.manufactureDate);
    const expireDate = parseDDMMYYYY(item.expireDate);
    if (!manufactureDate || !expireDate) {
      return NextResponse.json(
        { error: "Invalid manufacture or expire date in rows" },
        { status: 400 }
      );
    }
    if (expireDate < manufactureDate) {
      return NextResponse.json(
        { error: "Expire date must be after manufacture date" },
        { status: 400 }
      );
    }
    items.push({
      itemCode: item.itemCode,
      itemName: item.itemName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      manufactureDate,
      expireDate,
    });
  }

  await (prisma as unknown as {
    stickerBatchItem: {
      createMany: (args: {
        data: Array<{
          companyId: string;
          stickerBatchId: string;
          companyLocationId: string;
          itemCode: string;
          itemName: string;
          unitPrice: string;
          quantity: number;
          manufactureDate: Date;
          expireDate: Date;
        }>;
      }) => Promise<{ count: number }>;
    };
  }).stickerBatchItem.createMany({
    data: items.map((item) => ({
      companyId,
      stickerBatchId: batchId,
      companyLocationId: parsed.data.locationId,
      itemCode: item.itemCode,
      itemName: item.itemName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      manufactureDate: item.manufactureDate,
      expireDate: item.expireDate,
    })),
  });

  return NextResponse.json({ ok: true, count: items.length });
}
