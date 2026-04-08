import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission, requirePermission } from "@/lib/rbac";

const dateStringSchema = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/);

const createStickerBatchSchema = z.object({
  supplierId: z.string().min(1),
  batchName: z.string().trim().min(1).max(120),
  batchDate: dateStringSchema,
  remark: z
    .string()
    .max(1000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  locationId: z.string().min(1).optional(),
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
    .default([]),
}).superRefine((data, ctx) => {
  if (data.items.length > 0 && !data.locationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["locationId"],
      message: "Location is required when saving item rows",
    });
  }
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

function isPrismaKnownError(error: unknown): error is { code?: string } {
  return Boolean(error && typeof error === "object" && "code" in error);
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

export async function GET() {
  const auth = await requireAnyPermission(["stickers.batch.read", "stickers.print.read"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  if (!isStickerBatchPrismaReady()) {
    return NextResponse.json(
      {
        error:
          "Sticker Batch Prisma client is not ready. Run: npx prisma migrate dev -n add_sticker_batch_tables && npx prisma generate",
      },
      { status: 503 }
    );
  }

  try {
    const items = await (
      prisma as unknown as {
        stickerBatch: {
          findMany: (args: {
            where: { companyId: string };
            orderBy: { createdAt: "desc" };
            select: {
              id: true;
              batchName: true;
              batchDate: true;
              createdAt: true;
            };
          }) => Promise<Array<{ id: string; batchName: string; batchDate: Date; createdAt: Date }>>;
        };
      }
    ).stickerBatch.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        batchName: true,
        batchDate: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2021") {
      return NextResponse.json(
        { error: "Sticker batch tables are missing. Run Prisma migration first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to load sticker batches" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("stickers.batch.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  if (!isStickerBatchPrismaReady()) {
    return NextResponse.json(
      {
        error:
          "Sticker Batch Prisma client is not ready. Run: npx prisma migrate dev -n add_sticker_batch_tables && npx prisma generate",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createStickerBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const batchDate = parseDDMMYYYY(parsed.data.batchDate);
  if (!batchDate) {
    return NextResponse.json({ error: "Invalid batch date" }, { status: 400 });
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: parsed.data.supplierId, companyId },
    select: { id: true },
  });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  if (parsed.data.items.length > 0) {
    const location = await prisma.companyLocation.findFirst({
      where: { id: parsed.data.locationId, companyId },
      select: { id: true },
    });
    if (!location) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }
  }

  const normalizedItems: Array<{
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
    normalizedItems.push({
      ...item,
      manufactureDate,
      expireDate,
    });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const batch = await (
        tx as unknown as {
          stickerBatch: {
            create: (args: {
              data: {
                companyId: string;
                supplierId: string;
                batchName: string;
                batchDate: Date;
                remark: string | null;
              };
              select: {
                id: true;
                batchName: true;
                batchDate: true;
                remark: true;
                createdAt: true;
              };
            }) => Promise<{
              id: string;
              batchName: string;
              batchDate: Date;
              remark: string | null;
              createdAt: Date;
            }>;
          };
        }
      ).stickerBatch.create({
        data: {
          companyId,
          supplierId: parsed.data.supplierId,
          batchName: parsed.data.batchName,
          batchDate,
          remark: parsed.data.remark,
        },
        select: {
          id: true,
          batchName: true,
          batchDate: true,
          remark: true,
          createdAt: true,
        },
      });

      if (normalizedItems.length > 0 && parsed.data.locationId) {
        await (
          tx as unknown as {
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
              }) => Promise<unknown>;
            };
          }
        ).stickerBatchItem.createMany({
          data: normalizedItems.map((item) => ({
            companyId,
            stickerBatchId: batch.id,
            companyLocationId: parsed.data.locationId!,
            itemCode: item.itemCode,
            itemName: item.itemName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            manufactureDate: item.manufactureDate,
            expireDate: item.expireDate,
          })),
        });
      }

      return batch;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return NextResponse.json(
        { error: "Batch name already exists" },
        { status: 409 }
      );
    }
    if (isPrismaKnownError(error) && error.code === "P2021") {
      return NextResponse.json(
        { error: "Sticker batch tables are missing. Run Prisma migration first." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to save sticker batch" },
      { status: 500 }
    );
  }
}
